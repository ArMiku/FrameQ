use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow, Window};
use tauri_plugin_deep_link::DeepLinkExt;

mod account;
mod asr_model;
mod diagnostics;
mod history;
mod insight_preferences;
mod runtime;
mod settings;
mod task_manifest;
mod transcript_detail;
mod updates;
mod window_chrome;
mod worker_command;

pub(crate) use runtime::{
    bundled_python_path, ensure_runtime_dirs, path_to_env_string, prepend_to_path,
    resolve_runtime_paths, RuntimePaths, ALLOW_REAL_ASR_ENV, CACHE_DIR_ENV, CACHE_DIR_NAME,
    DESKTOP_LOG_DIR_NAME, MODELSCOPE_OFFLINE_ENV, MODEL_DIR_ENV, OUTPUT_DIR_ENV, RESOURCE_DIR_ENV,
    USER_DATA_DIR_ENV,
};

pub(crate) use diagnostics::{
    append_desktop_log, sanitize_diagnostic_text, summarize_worker_result_for_log, truncate_for_log,
};

pub(crate) use asr_model::{DEFAULT_ASR_MODEL, SUPPORTED_ASR_MODELS};

#[cfg(test)]
pub(crate) use asr_model::{ASR_MODEL_DOWNLOAD_EVENT_NAME, MODEL_DOWNLOAD_EVENT_PREFIX};

pub(crate) use worker_command::{
    build_worker_command_spec, parse_worker_output_or_fallback, parse_worker_stdout,
    run_blocking_worker_command, spawn_worker_command, terminate_process_tree,
    worker_command_log_detail, worker_exit_log_detail, WorkerCommandSpec, WorkerInvocation,
    WorkerProcessState,
};

use settings::{env_path, parse_dotenv_values, resolve_asr_model_value, ASR_MODEL_ENV};

const PROGRESS_EVENT_NAME: &str = "worker-progress";
const PROGRESS_EVENT_PREFIX: &str = "FRAMEQ_PROGRESS ";
#[derive(Debug, Deserialize, Serialize)]
struct ProcessVideoRequest {
    url: String,
    language: String,
    output_formats: Vec<String>,
    model: String,
    generate_insights: bool,
    insightflow_mode: String,
}

#[derive(Debug, Deserialize, Serialize)]
struct RetryInsightsRequest {
    task_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    preference_snapshot: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
struct WorkerError {
    code: String,
    message: String,
    stage: String,
}

#[derive(Debug, Serialize)]
struct ProcessVideoResult {
    status: String,
    task_id: Option<String>,
    task_dir: Option<String>,
    artifacts: HashMap<String, String>,
    text: String,
    summary: String,
    insights: Vec<task_manifest::InsightView>,
    transcript: Option<task_manifest::TranscriptMetadata>,
    error: Option<WorkerError>,
}

#[derive(Debug, Serialize)]
struct CancelProcessResult {
    cancelled: bool,
    error: Option<String>,
}

#[tauri::command]
async fn process_video(
    window: Window,
    app: AppHandle,
    process_state: State<'_, Arc<WorkerProcessState>>,
    request: ProcessVideoRequest,
) -> Result<serde_json::Value, String> {
    let process_state = Arc::clone(process_state.inner());
    run_blocking_worker_command(move || process_video_blocking(window, app, process_state, request))
        .await
}

fn process_video_blocking(
    window: Window,
    app: AppHandle,
    process_state: Arc<WorkerProcessState>,
    mut request: ProcessVideoRequest,
) -> Result<serde_json::Value, String> {
    let paths = resolve_runtime_paths(&app)?;
    ensure_runtime_dirs(&paths)?;
    let output_root = task_manifest::configured_output_root(&paths)?;
    if let Err(error) = apply_configured_asr_model_to_request(&env_path(&paths), &mut request) {
        return Ok(serde_json::json!(ProcessVideoResult {
            status: "failed".to_string(),
            task_id: None,
            task_dir: None,
            artifacts: HashMap::new(),
            text: String::new(),
            summary: String::new(),
            insights: vec![],
            transcript: None,
            error: Some(WorkerError {
                code: "ASR_MODEL_UNSUPPORTED".to_string(),
                message: error,
                stage: "video_transcribing".to_string(),
            }),
        }));
    }
    if let Some(cached) = cached_process_result_for_request(&output_root, &request)? {
        let _ = append_desktop_log(
            &paths,
            "worker.process_video.cache_hit",
            &summarize_worker_result_for_log(&cached),
        );
        return Ok(cached);
    }
    let request_json = serde_json::to_string(&request).map_err(|error| error.to_string())?;
    let llm_invocation = account::server_managed_llm_invocation(&paths)?;
    let spec = build_worker_command_spec(
        &paths,
        WorkerInvocation::ProcessVideo(request_json),
        llm_invocation,
    )?;
    let _ = append_desktop_log(
        &paths,
        "worker.process_video.start",
        &worker_command_log_detail(&spec, "process_video"),
    );
    let mut child = spawn_worker_command(spec)?;
    let worker_pid = child.id();
    if !process_state.register(worker_pid) {
        let _ = terminate_process_tree(worker_pid);
        return Ok(serde_json::json!(ProcessVideoResult {
            status: "failed".to_string(),
            task_id: None,
            task_dir: None,
            artifacts: HashMap::new(),
            text: String::new(),
            summary: String::new(),
            insights: vec![],
            transcript: None,
            error: Some(WorkerError {
                code: "WORKER_ALREADY_RUNNING".to_string(),
                message: "Another worker process is already running.".to_string(),
                stage: "video_extracting".to_string(),
            }),
        }));
    }

    let Some(stderr) = child.stderr.take() else {
        process_state.clear_current(worker_pid);
        let _ = terminate_process_tree(worker_pid);
        return Err("Could not capture worker stderr.".to_string());
    };
    let progress_window = window.clone();
    let stderr_reader = std::thread::spawn(move || {
        let mut diagnostic_lines = Vec::new();
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            if let Some(raw_event) = line.strip_prefix(PROGRESS_EVENT_PREFIX) {
                if let Ok(payload) = serde_json::from_str::<serde_json::Value>(raw_event) {
                    let _ = progress_window.emit(PROGRESS_EVENT_NAME, payload);
                }
            } else if !line.trim().is_empty() {
                diagnostic_lines.push(line);
            }
        }
        diagnostic_lines.join("\n")
    });

    let output = match child.wait_with_output() {
        Ok(output) => output,
        Err(error) => {
            process_state.clear_current(worker_pid);
            let _ = process_state.take_cancelled(worker_pid);
            return Err(error.to_string());
        }
    };
    process_state.clear_current(worker_pid);
    let was_cancelled = process_state.take_cancelled(worker_pid);
    let stderr = stderr_reader
        .join()
        .unwrap_or_else(|_| "Worker stderr reader failed.".to_string());
    let _ = append_desktop_log(
        &paths,
        "worker.process_video.exit",
        &worker_exit_log_detail(worker_pid, &output, &stderr),
    );

    if was_cancelled {
        let _ = append_desktop_log(
            &paths,
            "worker.process_video.cancelled",
            &format!("pid={worker_pid}"),
        );
        return Ok(serde_json::json!(ProcessVideoResult {
            status: "failed".to_string(),
            task_id: None,
            task_dir: None,
            artifacts: HashMap::new(),
            text: String::new(),
            summary: String::new(),
            insights: vec![],
            transcript: None,
            error: Some(WorkerError {
                code: "WORKER_CANCELLED".to_string(),
                message: "Worker process was cancelled.".to_string(),
                stage: "video_extracting".to_string(),
            }),
        }));
    }

    let parsed = parse_worker_output_or_fallback(
        &output,
        ProcessVideoResult {
            status: "failed".to_string(),
            task_id: None,
            task_dir: None,
            artifacts: HashMap::new(),
            text: String::new(),
            summary: String::new(),
            insights: vec![],
            transcript: None,
            error: Some(WorkerError {
                code: "WORKER_PROCESS_FAILED".to_string(),
                message: stderr,
                stage: "video_extracting".to_string(),
            }),
        },
    )?;
    let _ = append_desktop_log(
        &paths,
        "worker.process_video.result",
        &summarize_worker_result_for_log(&parsed),
    );
    Ok(parsed)
}

fn cached_process_result_for_request(
    output_root: &Path,
    request: &ProcessVideoRequest,
) -> Result<Option<serde_json::Value>, String> {
    let requested_source_url = normalize_cache_source_url(&request.url);
    if requested_source_url.is_empty() {
        return Ok(None);
    }

    let mut newest_cached: Option<(String, serde_json::Value)> = None;
    for manifest_path in task_manifest::list_task_manifest_paths(output_root)? {
        let Ok((manifest, task_dir)) = task_manifest::read_task_manifest_path(&manifest_path)
        else {
            continue;
        };
        if !reusable_task_manifest_matches(&manifest, &requested_source_url, request) {
            continue;
        }
        let Some((created_at, cached)) = cached_process_result_from_manifest(&task_dir, manifest)?
        else {
            continue;
        };
        if newest_cached
            .as_ref()
            .is_none_or(|(current_created_at, _)| created_at > *current_created_at)
        {
            newest_cached = Some((created_at, cached));
        }
    }

    Ok(newest_cached.map(|(_, value)| value))
}

fn reusable_task_manifest_matches(
    manifest: &task_manifest::TaskManifest,
    requested_source_url: &str,
    request: &ProcessVideoRequest,
) -> bool {
    if !matches!(manifest.status.as_str(), "completed" | "partial_completed") {
        return false;
    }
    if normalize_cache_source_url(&manifest.source_url) != requested_source_url {
        return false;
    }
    let manifest_model = manifest.model.trim();
    let request_model = request.model.trim();
    manifest_model.is_empty() || request_model.is_empty() || manifest_model == request_model
}

fn cached_process_result_from_manifest(
    task_dir: &Path,
    manifest: task_manifest::TaskManifest,
) -> Result<Option<(String, serde_json::Value)>, String> {
    let artifacts = cached_existing_artifacts(task_dir, &manifest);
    if !artifacts.contains_key("transcript_txt") {
        return Ok(None);
    }

    let text = read_cached_text_artifact(task_dir, &manifest, "transcript_txt").unwrap_or_default();
    let summary = read_cached_text_artifact(task_dir, &manifest, "summary").unwrap_or_default();
    let insights = read_cached_insights_artifact(task_dir, &manifest);
    let transcript = manifest.transcript_metadata();
    let status = manifest.status;
    let task_id = manifest.task_id;
    let created_at = manifest.created_at;
    let error = manifest.error.as_ref().map(|error| WorkerError {
        code: error.code.clone(),
        message: error.message.clone(),
        stage: error.stage.clone(),
    });

    let value = serde_json::json!(ProcessVideoResult {
        status,
        task_id: Some(task_id),
        task_dir: Some(path_to_env_string(task_dir)),
        artifacts,
        text,
        summary,
        insights,
        transcript,
        error,
    });
    Ok(Some((created_at, value)))
}

fn cached_existing_artifacts(
    task_dir: &Path,
    manifest: &task_manifest::TaskManifest,
) -> HashMap<String, String> {
    manifest
        .artifacts
        .iter()
        .filter_map(|(key, raw_path)| {
            let relative = task_manifest::validate_relative_artifact_path(raw_path, key).ok()?;
            let path = task_dir.join(relative);
            if !path.is_file()
                || task_manifest::validate_task_artifact_path(task_dir, &path, key).is_err()
            {
                return None;
            }
            Some((key.clone(), raw_path.clone()))
        })
        .collect()
}

fn read_cached_text_artifact(
    task_dir: &Path,
    manifest: &task_manifest::TaskManifest,
    key: &str,
) -> Option<String> {
    let path = task_manifest::artifact_path(task_dir, manifest, key).ok()??;
    task_manifest::validate_task_artifact_path(task_dir, &path, key).ok()?;
    fs::read_to_string(path)
        .ok()
        .map(|text| text.trim().to_string())
}

fn read_cached_insights_artifact(
    task_dir: &Path,
    manifest: &task_manifest::TaskManifest,
) -> Vec<task_manifest::InsightView> {
    let Some(content) = read_cached_text_artifact(task_dir, manifest, "insights") else {
        return vec![];
    };
    let Ok(payload) = serde_json::from_str::<serde_json::Value>(&content) else {
        return vec![];
    };
    task_manifest::parse_insights_payload(&payload)
}

fn normalize_cache_source_url(value: &str) -> String {
    value.trim().to_string()
}

#[tauri::command]
async fn retry_insights(
    app: AppHandle,
    process_state: State<'_, Arc<WorkerProcessState>>,
    request: RetryInsightsRequest,
) -> Result<serde_json::Value, String> {
    let process_state = Arc::clone(process_state.inner());
    run_blocking_worker_command(move || retry_insights_blocking(app, process_state, request)).await
}

fn retry_insights_blocking(
    app: AppHandle,
    process_state: Arc<WorkerProcessState>,
    request: RetryInsightsRequest,
) -> Result<serde_json::Value, String> {
    let paths = resolve_runtime_paths(&app)?;
    ensure_runtime_dirs(&paths)?;
    let request_json = serde_json::to_string(&request).map_err(|error| error.to_string())?;
    let llm_invocation = account::server_managed_llm_invocation(&paths)?;
    let spec = build_worker_command_spec(
        &paths,
        WorkerInvocation::RetryInsights(request_json),
        llm_invocation,
    )?;
    let _ = append_desktop_log(
        &paths,
        "worker.retry_insights.start",
        &worker_command_log_detail(&spec, "retry_insights"),
    );
    let child = spawn_worker_command(spec)?;
    let worker_pid = child.id();
    if !process_state.register(worker_pid) {
        let _ = terminate_process_tree(worker_pid);
        return Ok(serde_json::json!(ProcessVideoResult {
            status: "partial_completed".to_string(),
            task_id: Some(request.task_id),
            task_dir: None,
            artifacts: HashMap::new(),
            text: String::new(),
            summary: String::new(),
            insights: vec![],
            transcript: None,
            error: Some(WorkerError {
                code: "WORKER_ALREADY_RUNNING".to_string(),
                message: "Another worker process is already running.".to_string(),
                stage: "insights_generating".to_string(),
            }),
        }));
    }

    let output = match child.wait_with_output() {
        Ok(output) => output,
        Err(error) => {
            process_state.clear_current(worker_pid);
            let _ = process_state.take_cancelled(worker_pid);
            return Err(error.to_string());
        }
    };
    process_state.clear_current(worker_pid);
    let was_cancelled = process_state.take_cancelled(worker_pid);
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let _ = append_desktop_log(
        &paths,
        "worker.retry_insights.exit",
        &worker_exit_log_detail(worker_pid, &output, &stderr),
    );

    if was_cancelled {
        let _ = append_desktop_log(
            &paths,
            "worker.retry_insights.cancelled",
            &format!("pid={worker_pid} task_id={}", request.task_id),
        );
        return Ok(serde_json::json!(ProcessVideoResult {
            status: "partial_completed".to_string(),
            task_id: Some(request.task_id),
            task_dir: None,
            artifacts: HashMap::new(),
            text: String::new(),
            summary: String::new(),
            insights: vec![],
            transcript: None,
            error: Some(WorkerError {
                code: "WORKER_CANCELLED".to_string(),
                message: "Worker process was cancelled.".to_string(),
                stage: "insights_generating".to_string(),
            }),
        }));
    }

    let parsed = parse_worker_output_or_fallback(
        &output,
        ProcessVideoResult {
            status: "partial_completed".to_string(),
            task_id: Some(request.task_id),
            task_dir: None,
            artifacts: HashMap::new(),
            text: String::new(),
            summary: String::new(),
            insights: vec![],
            transcript: None,
            error: Some(WorkerError {
                code: "WORKER_PROCESS_FAILED".to_string(),
                message: stderr,
                stage: "insights_generating".to_string(),
            }),
        },
    )?;
    let _ = append_desktop_log(
        &paths,
        "worker.retry_insights.result",
        &summarize_worker_result_for_log(&parsed),
    );
    Ok(parsed)
}

#[tauri::command]
fn cancel_process(
    process_state: State<'_, Arc<WorkerProcessState>>,
) -> Result<CancelProcessResult, String> {
    let Some(pid) = process_state.current_pid() else {
        return Ok(CancelProcessResult {
            cancelled: false,
            error: None,
        });
    };

    process_state.mark_cancelled(pid);
    match terminate_process_tree(pid) {
        Ok(()) => {
            process_state.clear_current(pid);
            Ok(CancelProcessResult {
                cancelled: true,
                error: None,
            })
        }
        Err(error) => Ok(CancelProcessResult {
            cancelled: false,
            error: Some(error),
        }),
    }
}

fn apply_configured_asr_model_to_request(
    dotenv_path: &Path,
    request: &mut ProcessVideoRequest,
) -> Result<(), String> {
    let values = parse_dotenv_values(dotenv_path)?;
    let configured_model = values.get(ASR_MODEL_ENV).cloned();
    if configured_model.as_deref().unwrap_or("").trim().is_empty() {
        request.model = resolve_asr_model_value(Some(request.model.clone()))?;
    } else {
        request.model = resolve_asr_model_value(configured_model)?;
    }
    Ok(())
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

trait DeepLinkActivationWindow {
    fn unminimize_window(&self) -> Result<(), String>;
    fn show_window(&self) -> Result<(), String>;
    fn focus_window(&self) -> Result<(), String>;
    fn emit_deep_link_args(&self, argv: Vec<String>) -> Result<(), String>;
}

impl DeepLinkActivationWindow for WebviewWindow {
    fn unminimize_window(&self) -> Result<(), String> {
        self.unminimize().map_err(|error| error.to_string())
    }

    fn show_window(&self) -> Result<(), String> {
        self.show().map_err(|error| error.to_string())
    }

    fn focus_window(&self) -> Result<(), String> {
        self.set_focus().map_err(|error| error.to_string())
    }

    fn emit_deep_link_args(&self, argv: Vec<String>) -> Result<(), String> {
        self.emit("frameq-deep-link-args", argv)
            .map_err(|error| error.to_string())
    }
}

fn activate_main_window_for_deep_link<W: DeepLinkActivationWindow>(window: &W, argv: Vec<String>) {
    let _ = window.unminimize_window();
    let _ = window.show_window();
    let _ = window.focus_window();
    let _ = window.emit_deep_link_args(argv);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Arc::new(WorkerProcessState::default()))
        .manage(Arc::new(asr_model::ModelDownloadProcessState::default()))
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                activate_main_window_for_deep_link(&window, argv);
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(any(windows, target_os = "linux"))]
            if let Err(error) = app.deep_link().register_all() {
                eprintln!("[frameq] failed to register deep links: {error}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            process_video,
            retry_insights,
            cancel_process,
            settings::get_llm_config,
            settings::save_llm_config,
            insight_preferences::get_insight_preferences,
            insight_preferences::save_inspiration_profile,
            insight_preferences::skip_inspiration_profile,
            insight_preferences::clear_inspiration_profile,
            insight_preferences::save_default_generation_preferences,
            history::get_history,
            transcript_detail::load_transcript_detail,
            transcript_detail::save_transcript_edit,
            updates::get_update_preferences,
            updates::save_update_preferences,
            updates::get_update_delivery,
            asr_model::check_first_run,
            asr_model::download_asr_model,
            asr_model::cancel_asr_model_download,
            account::begin_auth_flow,
            account::complete_auth_flow,
            account::get_account_status,
            account::logout_account,
            account::redeem_activation_code,
            account::create_wechat_checkout,
            account::get_checkout_status,
            window_chrome::start_window_drag,
            window_chrome::close_window,
            window_chrome::minimize_window,
            window_chrome::toggle_maximize_window,
            window_chrome::get_window_position,
            window_chrome::set_window_position
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::account::{
        build_activation_redeem_url, build_auth_login_url, parse_auth_callback_url,
        server_base_url, AuthCallback,
    };
    use super::settings::{load_llm_config_from_file, save_llm_config_to_file, LlmConfigInput};
    use super::{
        activate_main_window_for_deep_link, apply_configured_asr_model_to_request,
        cached_process_result_for_request, path_to_env_string, DeepLinkActivationWindow,
        ProcessVideoRequest, RetryInsightsRequest,
    };
    use std::cell::RefCell;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[derive(Default)]
    struct FakeDeepLinkWindow {
        actions: RefCell<Vec<String>>,
    }

    impl FakeDeepLinkWindow {
        fn record(&self, action: &str) {
            self.actions.borrow_mut().push(action.to_string());
        }
    }

    impl DeepLinkActivationWindow for FakeDeepLinkWindow {
        fn unminimize_window(&self) -> Result<(), String> {
            self.record("unminimize");
            Ok(())
        }

        fn show_window(&self) -> Result<(), String> {
            self.record("show");
            Ok(())
        }

        fn focus_window(&self) -> Result<(), String> {
            self.record("focus");
            Ok(())
        }

        fn emit_deep_link_args(&self, argv: Vec<String>) -> Result<(), String> {
            self.record(&format!("emit:{}", argv.join("|")));
            Ok(())
        }
    }

    #[test]
    fn deep_link_activation_brings_existing_main_window_forward() {
        let window = FakeDeepLinkWindow::default();

        activate_main_window_for_deep_link(
            &window,
            vec!["frameq://auth/callback?ticket=flt_abc&state=state-1".to_string()],
        );

        assert_eq!(
            window.actions.into_inner(),
            vec![
                "unminimize",
                "show",
                "focus",
                "emit:frameq://auth/callback?ticket=flt_abc&state=state-1",
            ]
        );
    }

    #[test]
    fn cached_process_result_reuses_completed_task_for_same_source_url() {
        let output_root = temp_dir("cached_process_result_reuses_completed_task");
        let task_id = "20260705-153012-youtube-dQw4w9WgXcQ";
        let task_dir = output_root.join("tasks").join(task_id);
        fs::create_dir_all(task_dir.join("transcript")).expect("create transcript dir");
        fs::create_dir_all(task_dir.join("ai")).expect("create ai dir");
        fs::write(
            task_dir.join("transcript").join("transcript.txt"),
            "cached transcript\n",
        )
        .expect("write transcript");
        fs::write(task_dir.join("ai").join("summary.md"), "# cached summary\n")
            .expect("write summary");
        fs::write(
            task_dir.join("ai").join("insights.json"),
            r#"{"schemaVersion":1,"insights":[{"id":1,"topic":"cached topic","matchReason":"matched","followUpQuestions":["next question"],"suitableUse":"content planning","sourceChunkId":3}]}"#,
        )
        .expect("write insights");
        fs::write(
            task_dir.join("frameq-task.json"),
            format!(
                r#"{{
  "schema_version": 2,
  "task_id": "{task_id}",
  "created_at": "2026-07-05T15:30:12Z",
  "source_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "platform": "youtube",
  "status": "completed",
  "model": "iic/SenseVoiceSmall",
  "transcript": {{
    "source": "subtitle",
    "language": "zh-Hans",
    "engine": null
  }},
  "artifacts": {{
    "transcript_txt": "transcript/transcript.txt",
    "summary": "ai/summary.md",
    "insights": "ai/insights.json"
  }},
  "error": null,
  "text_preview": "cached transcript",
  "insights_count": 1
}}"#
            ),
        )
        .expect("write manifest");

        let request = ProcessVideoRequest {
            url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ".to_string(),
            language: "Chinese".to_string(),
            output_formats: vec!["txt".to_string(), "md".to_string()],
            model: "iic/SenseVoiceSmall".to_string(),
            generate_insights: true,
            insightflow_mode: "embedded".to_string(),
        };

        let cached = cached_process_result_for_request(&output_root, &request)
            .expect("read cached result")
            .expect("same URL should reuse cached task");

        assert_eq!(cached["status"], "completed");
        assert_eq!(cached["task_id"], task_id);
        assert_eq!(
            cached["task_dir"],
            path_to_env_string(output_root.join("tasks").join(task_id))
        );
        assert_eq!(cached["text"], "cached transcript");
        assert_eq!(cached["summary"], "# cached summary");
        assert_eq!(cached["insights"][0]["topic"], "cached topic");
        assert_eq!(cached["insights"][0]["matchReason"], "matched");
        assert_eq!(cached["insights"][0]["sourceChunkId"], 3);
        assert_eq!(cached["transcript"]["source"], "subtitle");
        assert_eq!(cached["transcript"]["language"], "zh-Hans");
        assert!(cached["transcript"]["engine"].is_null());
    }

    #[test]
    fn cached_process_result_ignores_insights_without_v1_schema() {
        let output_root = temp_dir("cached_process_result_ignores_insights_without_schema");
        let task_id = "20260705-153012-youtube-dQw4w9WgXcQ";
        let task_dir = output_root.join("tasks").join(task_id);
        fs::create_dir_all(task_dir.join("transcript")).expect("create transcript dir");
        fs::create_dir_all(task_dir.join("ai")).expect("create ai dir");
        fs::write(
            task_dir.join("transcript").join("transcript.txt"),
            "cached transcript\n",
        )
        .expect("write transcript");
        fs::write(task_dir.join("ai").join("summary.md"), "# cached summary\n")
            .expect("write summary");
        fs::write(
            task_dir.join("ai").join("insights.json"),
            r#"{"insights":[{"id":1,"topic":"cached topic","matchReason":"matched","followUpQuestions":["next question"],"suitableUse":"content planning","sourceChunkId":3}]}"#,
        )
        .expect("write insights");
        fs::write(
            task_dir.join("frameq-task.json"),
            format!(
                r#"{{
  "schema_version": 2,
  "task_id": "{task_id}",
  "created_at": "2026-07-05T15:30:12Z",
  "source_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "platform": "youtube",
  "status": "completed",
  "artifacts": {{
    "transcript_txt": "transcript/transcript.txt",
    "summary": "ai/summary.md",
    "insights": "ai/insights.json"
  }},
  "error": null,
  "text_preview": "cached transcript",
  "insights_count": 1
}}"#
            ),
        )
        .expect("write manifest");

        let request = ProcessVideoRequest {
            url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ".to_string(),
            language: "Chinese".to_string(),
            output_formats: vec!["txt".to_string(), "md".to_string()],
            model: "iic/SenseVoiceSmall".to_string(),
            generate_insights: true,
            insightflow_mode: "embedded".to_string(),
        };

        let cached = cached_process_result_for_request(&output_root, &request)
            .expect("read cached result")
            .expect("same URL should reuse cached task");

        assert_eq!(cached["status"], "completed");
        assert_eq!(cached["text"], "cached transcript");
        assert!(cached["insights"]
            .as_array()
            .expect("insights array")
            .is_empty());
    }

    #[test]
    fn cached_process_result_ignores_unusable_history_without_blocking_new_url() {
        let output_root = temp_dir("cached_process_result_ignores_unusable_history");
        let task_id = "20260705-153012-youtube-missing";
        let task_dir = output_root.join("tasks").join(task_id);
        fs::create_dir_all(&task_dir).expect("create task dir");
        fs::write(
            task_dir.join("frameq-task.json"),
            format!(
                r#"{{
  "schema_version": 1,
  "task_id": "{task_id}",
  "created_at": "2026-07-05T15:30:12Z",
  "source_url": "https://www.youtube.com/watch?v=missing",
  "platform": "youtube",
  "status": "completed",
  "artifacts": {{
    "transcript_txt": "transcript/transcript.txt"
  }},
  "error": null,
  "text_preview": "",
  "insights_count": 0
}}"#
            ),
        )
        .expect("write manifest");
        let request = ProcessVideoRequest {
            url: "https://www.youtube.com/watch?v=new-video".to_string(),
            language: "Chinese".to_string(),
            output_formats: vec!["txt".to_string(), "md".to_string()],
            model: "iic/SenseVoiceSmall".to_string(),
            generate_insights: true,
            insightflow_mode: "embedded".to_string(),
        };

        let cached = cached_process_result_for_request(&output_root, &request)
            .expect("broken history should not block processing");

        assert!(cached.is_none());
    }

    #[test]
    fn retry_insights_request_round_trips_preference_snapshot_payload() {
        let payload = serde_json::json!({
            "task_id": "20260705-153012-douyin-demo",
            "preference_snapshot": {
                "profile": null,
                "profileSkipped": true,
                "generationPreferences": {
                    "goal": "content_creation",
                    "scenario": "short_video",
                    "angles": ["topic_angle"],
                    "audience": "fans_readers",
                    "styles": ["grounded"],
                    "avoid": []
                },
                "labelSnapshot": {
                    "profile": [],
                    "generationPreferences": []
                }
            }
        });

        let request: RetryInsightsRequest =
            serde_json::from_value(payload).expect("deserialize retry request");
        let serialized = serde_json::to_value(&request).expect("serialize retry request");

        assert_eq!(
            serialized["preference_snapshot"]["generationPreferences"]["goal"],
            "content_creation"
        );
        assert_eq!(serialized["preference_snapshot"]["profileSkipped"], true);
    }

    #[test]
    fn auth_login_url_includes_state_and_redirect_scheme() {
        let url =
            build_auth_login_url("https://frameq.example", "state-123456").expect("build auth url");

        assert_eq!(
            url,
            "https://frameq.example/login?desktop=1&state=state-123456&redirect_uri=frameq%3A%2F%2Fauth%2Fcallback"
        );
    }

    #[test]
    fn server_base_url_defaults_to_production_domain_and_allows_override() {
        let original = std::env::var("FRAMEQ_SERVER_BASE_URL").ok();
        std::env::remove_var("FRAMEQ_SERVER_BASE_URL");

        assert_eq!(server_base_url(), "https://frameq.8xf.pro");

        std::env::set_var("FRAMEQ_SERVER_BASE_URL", "http://127.0.0.1:8787/");

        assert_eq!(server_base_url(), "http://127.0.0.1:8787");

        match original {
            Some(value) => std::env::set_var("FRAMEQ_SERVER_BASE_URL", value),
            None => std::env::remove_var("FRAMEQ_SERVER_BASE_URL"),
        }
    }

    #[test]
    fn activation_redeem_url_targets_desktop_activation_route() {
        assert_eq!(
            build_activation_redeem_url("https://frameq.example/"),
            "https://frameq.example/api/desktop/activation-codes/redeem"
        );
    }

    #[test]
    fn auth_callback_parser_accepts_matching_state() {
        let callback = parse_auth_callback_url(
            "frameq://auth/callback?ticket=flt_abc123&state=state-123456",
            "state-123456",
        )
        .expect("parse auth callback");

        assert_eq!(
            callback,
            AuthCallback {
                ticket: "flt_abc123".to_string(),
                state: "state-123456".to_string(),
            }
        );
    }

    #[test]
    fn auth_callback_parser_rejects_wrong_state_or_path() {
        assert!(parse_auth_callback_url(
            "frameq://auth/callback?ticket=flt_abc123&state=other-state",
            "state-123456",
        )
        .is_err());
        assert!(parse_auth_callback_url(
            "frameq://billing/callback?ticket=flt_abc123&state=state-123456",
            "state-123456",
        )
        .is_err());
    }

    #[test]
    fn load_llm_config_reads_only_local_app_settings() {
        let env_path = temp_env_path("load_llm_config_reads_only_local_app_settings");
        fs::write(
            &env_path,
            [
                "FRAMEQ_LLM_PROVIDER=openai_compatible",
                "FRAMEQ_LLM_BASE_URL=https://llm.example/v1",
                "FRAMEQ_LLM_API_KEY=secret-key",
                "FRAMEQ_LLM_MODEL=demo-model",
                "FRAMEQ_LLM_TIMEOUT_SECONDS=42",
                "FRAMEQ_OUTPUT_DIR=D:/FrameQ/results",
                "FRAMEQ_ASR_MODEL=iic/SenseVoiceSmall",
            ]
            .join("\n"),
        )
        .expect("write test env");

        let config = load_llm_config_from_file(&env_path).expect("load config");

        assert_eq!(config.output_dir, "D:/FrameQ/results");
        assert_eq!(config.asr_model, "iic/SenseVoiceSmall");
        assert_eq!(config.supported_asr_models, vec!["iic/SenseVoiceSmall"]);
    }

    #[test]
    fn load_llm_config_creates_app_local_env_template_and_reports_path() {
        let env_path = temp_env_path("load_llm_config_creates_app_local_env_template");

        let config = load_llm_config_from_file(&env_path).expect("load config");
        let saved = fs::read_to_string(&env_path).expect("read created env");

        assert_eq!(config.config_path, path_to_env_string(&env_path));
        assert_eq!(config.asr_model, "iic/SenseVoiceSmall");
        assert!(saved.contains("FrameQ desktop local settings"));
        assert!(saved.contains("FRAMEQ_OUTPUT_DIR="));
        assert!(saved.contains("FRAMEQ_ASR_MODEL=iic/SenseVoiceSmall"));
        assert!(!saved.contains("FRAMEQ_LLM_API_KEY"));
    }

    #[test]
    fn save_llm_config_updates_local_settings_and_removes_old_llm_values() {
        let env_path = temp_env_path("save_llm_config_updates_local_settings");
        fs::write(
            &env_path,
            [
                "# keep this comment",
                "FRAMEQ_LLM_PROVIDER=openai_compatible",
                "FRAMEQ_LLM_BASE_URL=https://old.example/v1",
                "FRAMEQ_LLM_API_KEY=old-secret",
                "FRAMEQ_LLM_MODEL=old-model",
                "FRAMEQ_LLM_TIMEOUT_SECONDS=44",
                "OTHER_SETTING=keep-me",
            ]
            .join("\n"),
        )
        .expect("write test env");

        let config = save_llm_config_to_file(
            &env_path,
            LlmConfigInput {
                output_dir: "D:/FrameQ/custom-results".to_string(),
                asr_model: "iic/SenseVoiceSmall".to_string(),
            },
        )
        .expect("save config");
        let saved = fs::read_to_string(&env_path).expect("read saved env");

        assert_eq!(config.output_dir, "D:/FrameQ/custom-results");
        assert_eq!(config.asr_model, "iic/SenseVoiceSmall");
        assert_eq!(config.config_path, path_to_env_string(&env_path));
        assert!(saved.contains("FRAMEQ_OUTPUT_DIR=D:/FrameQ/custom-results"));
        assert!(saved.contains("FRAMEQ_ASR_MODEL=iic/SenseVoiceSmall"));
        assert!(saved.contains("OTHER_SETTING=keep-me"));
        assert!(!saved.contains("FRAMEQ_LLM_PROVIDER"));
        assert!(!saved.contains("FRAMEQ_LLM_BASE_URL"));
        assert!(!saved.contains("FRAMEQ_LLM_API_KEY"));
        assert!(!saved.contains("FRAMEQ_LLM_MODEL"));
        assert!(!saved.contains("FRAMEQ_LLM_TIMEOUT_SECONDS"));
    }

    #[test]
    fn save_llm_config_allows_output_dir_without_llm_credentials() {
        let env_path = temp_env_path("save_llm_config_allows_output_dir_only");

        let config = save_llm_config_to_file(
            &env_path,
            LlmConfigInput {
                output_dir: "D:/FrameQ/results-only".to_string(),
                asr_model: "iic/SenseVoiceSmall".to_string(),
            },
        )
        .expect("save output directory");
        let saved = fs::read_to_string(&env_path).expect("read saved env");

        assert_eq!(config.output_dir, "D:/FrameQ/results-only");
        assert_eq!(config.asr_model, "iic/SenseVoiceSmall");
        assert!(saved.contains("FRAMEQ_OUTPUT_DIR=D:/FrameQ/results-only"));
        assert!(saved.contains("FRAMEQ_ASR_MODEL=iic/SenseVoiceSmall"));
        assert!(saved.contains("FrameQ desktop local settings"));
        assert!(!saved.contains("FRAMEQ_LLM_API_KEY"));
    }

    #[test]
    fn desktop_worker_contract_matches_tauri_constants() {
        let contract_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("contracts")
            .join("desktop-worker-contract.json");
        let contract: serde_json::Value = serde_json::from_str(
            &fs::read_to_string(contract_path).expect("read desktop worker contract"),
        )
        .expect("parse desktop worker contract");

        assert_eq!(
            super::PROGRESS_EVENT_NAME,
            contract["events"]["workerProgress"]
        );
        assert_eq!(
            super::ASR_MODEL_DOWNLOAD_EVENT_NAME,
            contract["events"]["asrModelDownloadProgress"]
        );
        assert_eq!(
            super::PROGRESS_EVENT_PREFIX,
            contract["events"]["workerProgressPrefix"]
        );
        assert_eq!(
            super::MODEL_DOWNLOAD_EVENT_PREFIX,
            contract["events"]["asrModelDownloadPrefix"]
        );
        assert_eq!(super::DEFAULT_ASR_MODEL, contract["asr"]["defaultModel"]);
        assert_eq!(super::OUTPUT_DIR_ENV, contract["env"]["outputDir"]);
        assert_eq!(super::CACHE_DIR_ENV, contract["env"]["cacheDir"]);
        assert_eq!(super::MODEL_DIR_ENV, contract["env"]["modelDir"]);
    }

    #[test]
    fn apply_configured_asr_model_overrides_worker_request_model() {
        let env_path = temp_env_path("apply_configured_asr_model");
        fs::write(&env_path, "FRAMEQ_ASR_MODEL=iic/SenseVoiceSmall").expect("write test env");
        let mut request = ProcessVideoRequest {
            url: "https://www.douyin.com/video/7646789377271647540".to_string(),
            language: "Chinese".to_string(),
            output_formats: vec!["txt".to_string(), "md".to_string()],
            model: "iic/SenseVoiceSmall".to_string(),
            generate_insights: true,
            insightflow_mode: "embedded".to_string(),
        };

        apply_configured_asr_model_to_request(&env_path, &mut request).expect("apply asr model");

        assert_eq!(request.model, "iic/SenseVoiceSmall");
    }

    fn temp_env_path(test_name: &str) -> PathBuf {
        temp_dir(test_name).join(".env")
    }

    fn temp_dir(test_name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("frameq-{test_name}-{unique}"));
        fs::create_dir_all(&dir).expect("create test dir");
        dir
    }
}
