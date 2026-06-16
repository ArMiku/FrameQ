use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{Emitter, State, Window};

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
    transcript_path: String,
    text: String,
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
    text: String,
    insights: Vec<String>,
    transcript_path: Option<String>,
    insights_path: Option<String>,
    error: Option<WorkerError>,
}

#[derive(Debug, Serialize)]
struct CancelProcessResult {
    cancelled: bool,
    error: Option<String>,
}

#[derive(Default)]
struct WorkerProcessState {
    current_pid: Mutex<Option<u32>>,
    cancelled_pid: Mutex<Option<u32>>,
}

impl WorkerProcessState {
    fn register(&self, pid: u32) -> bool {
        let mut current_pid = self.current_pid.lock().expect("worker state lock poisoned");
        if current_pid.is_some() {
            return false;
        }

        *current_pid = Some(pid);
        true
    }

    fn current_pid(&self) -> Option<u32> {
        *self.current_pid.lock().expect("worker state lock poisoned")
    }

    fn clear_current(&self, pid: u32) {
        let mut current_pid = self.current_pid.lock().expect("worker state lock poisoned");
        if *current_pid == Some(pid) {
            *current_pid = None;
        }
    }

    fn mark_cancelled(&self, pid: u32) {
        let mut cancelled_pid = self
            .cancelled_pid
            .lock()
            .expect("worker cancelled state lock poisoned");
        *cancelled_pid = Some(pid);
    }

    fn take_cancelled(&self, pid: u32) -> bool {
        let mut cancelled_pid = self
            .cancelled_pid
            .lock()
            .expect("worker cancelled state lock poisoned");
        if *cancelled_pid == Some(pid) {
            *cancelled_pid = None;
            return true;
        }

        false
    }
}

#[tauri::command]
fn process_video(
    window: Window,
    process_state: State<'_, WorkerProcessState>,
    request: ProcessVideoRequest,
) -> Result<serde_json::Value, String> {
    let project_root = find_project_root()
        .ok_or_else(|| "Could not find FrameQ project root for worker execution.".to_string())?;
    let request_json = serde_json::to_string(&request).map_err(|error| error.to_string())?;
    let worker_path = project_root.join("worker");
    let mut child = Command::new("uv")
        .args(["run", "python", "-m", "frameq_worker", "--request-json", &request_json])
        .env("PYTHONPATH", worker_path)
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .current_dir(project_root)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;
    let worker_pid = child.id();
    if !process_state.register(worker_pid) {
        let _ = terminate_process_tree(worker_pid);
        return Ok(serde_json::json!(ProcessVideoResult {
            status: "failed".to_string(),
            text: String::new(),
            insights: vec![],
            transcript_path: None,
            insights_path: None,
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

    if was_cancelled {
        return Ok(serde_json::json!(ProcessVideoResult {
            status: "failed".to_string(),
            text: String::new(),
            insights: vec![],
            transcript_path: None,
            insights_path: None,
            error: Some(WorkerError {
                code: "WORKER_CANCELLED".to_string(),
                message: "Worker process was cancelled.".to_string(),
                stage: "video_extracting".to_string(),
            }),
        }));
    }

    if !output.status.success() {
        return Ok(serde_json::json!(ProcessVideoResult {
            status: "failed".to_string(),
            text: String::new(),
            insights: vec![],
            transcript_path: None,
            insights_path: None,
            error: Some(WorkerError {
                code: "WORKER_PROCESS_FAILED".to_string(),
                message: stderr,
                stage: "video_extracting".to_string(),
            }),
        }));
    }

    serde_json::from_slice(&output.stdout).map_err(|error| error.to_string())
}

#[tauri::command]
fn retry_insights(
    process_state: State<'_, WorkerProcessState>,
    request: RetryInsightsRequest,
) -> Result<serde_json::Value, String> {
    let project_root = find_project_root()
        .ok_or_else(|| "Could not find FrameQ project root for worker execution.".to_string())?;
    let request_json = serde_json::to_string(&request).map_err(|error| error.to_string())?;
    let worker_path = project_root.join("worker");
    let child = Command::new("uv")
        .args([
            "run",
            "python",
            "-m",
            "frameq_worker",
            "--retry-insights-json",
            &request_json,
        ])
        .env("PYTHONPATH", worker_path)
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .current_dir(project_root)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;
    let worker_pid = child.id();
    if !process_state.register(worker_pid) {
        let _ = terminate_process_tree(worker_pid);
        return Ok(serde_json::json!(ProcessVideoResult {
            status: "partial_completed".to_string(),
            text: request.text,
            insights: vec![],
            transcript_path: Some(request.transcript_path),
            insights_path: None,
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

    if was_cancelled {
        return Ok(serde_json::json!(ProcessVideoResult {
            status: "partial_completed".to_string(),
            text: request.text,
            insights: vec![],
            transcript_path: Some(request.transcript_path),
            insights_path: None,
            error: Some(WorkerError {
                code: "WORKER_CANCELLED".to_string(),
                message: "Worker process was cancelled.".to_string(),
                stage: "insights_generating".to_string(),
            }),
        }));
    }

    if !output.status.success() {
        return Ok(serde_json::json!(ProcessVideoResult {
            status: "partial_completed".to_string(),
            text: request.text,
            insights: vec![],
            transcript_path: Some(request.transcript_path),
            insights_path: None,
            error: Some(WorkerError {
                code: "WORKER_PROCESS_FAILED".to_string(),
                message: String::from_utf8_lossy(&output.stderr).to_string(),
                stage: "insights_generating".to_string(),
            }),
        }));
    }

    serde_json::from_slice(&output.stdout).map_err(|error| error.to_string())
}

#[tauri::command]
fn cancel_process(
    process_state: State<'_, WorkerProcessState>,
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

#[cfg(target_os = "windows")]
fn terminate_process_tree(pid: u32) -> Result<(), String> {
    let output = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .output()
        .map_err(|error| error.to_string())?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        Err("taskkill failed to terminate the worker process.".to_string())
    } else {
        Err(stderr)
    }
}

#[cfg(not(target_os = "windows"))]
fn terminate_process_tree(pid: u32) -> Result<(), String> {
    let output = Command::new("kill")
        .args(["-TERM", &pid.to_string()])
        .output()
        .map_err(|error| error.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

fn find_project_root() -> Option<PathBuf> {
    let current_dir = std::env::current_dir().ok()?;
    current_dir
        .ancestors()
        .find(|path| is_project_root(path))
        .map(Path::to_path_buf)
}

fn is_project_root(path: &Path) -> bool {
    path.join("pyproject.toml").exists() && path.join("worker").exists()
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WorkerProcessState::default())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            process_video,
            retry_insights,
            cancel_process
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::WorkerProcessState;

    #[test]
    fn worker_process_state_tracks_only_one_running_process() {
        let state = WorkerProcessState::default();

        assert!(state.register(10));
        assert_eq!(state.current_pid(), Some(10));
        assert!(!state.register(11));
        assert_eq!(state.current_pid(), Some(10));
    }

    #[test]
    fn worker_process_state_marks_cancelled_pid_once() {
        let state = WorkerProcessState::default();

        assert!(state.register(10));
        state.mark_cancelled(10);

        assert!(state.take_cancelled(10));
        assert!(!state.take_cancelled(10));
        assert!(!state.take_cancelled(11));
    }

    #[test]
    fn worker_process_state_clears_matching_current_process() {
        let state = WorkerProcessState::default();

        assert!(state.register(10));
        state.clear_current(11);
        assert_eq!(state.current_pid(), Some(10));
        state.clear_current(10);
        assert_eq!(state.current_pid(), None);
    }
}
