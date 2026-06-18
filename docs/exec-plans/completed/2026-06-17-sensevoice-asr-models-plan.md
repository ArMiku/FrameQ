# SenseVoice ASR Model Support Plan

This ExecPlan is a living document. The sections Progress, Surprises & Discoveries,
Decision Log, and Outcomes & Retrospective must be kept up to date as work proceeds.

## Purpose / Big Picture

FrameQ should support ASR model selection without breaking the existing local-first processing flow. After this change, users can choose between SenseVoice Small and Qwen3-ASR from settings. The selected model is saved locally and used by future processing tasks; generated transcript metadata and history continue to reflect the actual model used.

## Progress

- [x] 2026-06-17: User approved方案 A: add ASR model selection to settings, persist `FRAMEQ_ASR_MODEL`, and support SenseVoice Small in the worker.
- [x] 2026-06-17: Product, architecture, design, security, `.env.example`, task list, and active plan updated before implementation.
- [x] 2026-06-17: Added failing worker tests for ASR model registry, SenseVoice adapter behavior, and `.env` override.
- [x] 2026-06-17: Implemented worker ASR registry and SenseVoice transcriber using `funasr.AutoModel`.
- [x] 2026-06-17: Extended Tauri config read/save and process request model override.
- [x] 2026-06-17: Extended frontend settings UI, client mapping, and request tests.
- [x] 2026-06-17: Ran full validation and recorded outcomes.

## Surprises & Discoveries

- Evidence: The current frontend always sends `Qwen/Qwen3-ASR-0.6B` in `app/src/workerClient.ts`, so saved ASR selection must either update the frontend request or be enforced in Tauri before spawning the worker.
- Evidence: The local environment currently has `modelscope` and `qwen_asr`, but not `funasr`; SenseVoice real inference requires adding `funasr` as a worker dependency.
- Evidence: Existing ASR writes the model name into transcript markdown through `write_transcript_files`, so the selected model can be preserved without changing output format.
- Evidence: Adding `funasr` caused `uv` to install 23 additional packages during the focused worker test run.

## Decision Log

- Decision: Persist ASR model selection in `.env` as `FRAMEQ_ASR_MODEL`. Rationale: it matches existing LLM/output settings, stays local, and can be read by Tauri and worker. Date/Author: 2026-06-17 / Codex.
- Decision: Keep `Qwen/Qwen3-ASR-0.6B` as default for the initial SenseVoice support change. Rationale: it was already validated locally and avoided surprising changes for existing users. Date/Author: 2026-06-17 / Codex.
- Decision update: Make `iic/SenseVoiceSmall` the default ASR model after user request. Rationale: SenseVoice is now the preferred default while Qwen remains available as an explicit option. Date/Author: 2026-06-17 / Codex.
- Decision: Use `funasr.AutoModel` for SenseVoice models. Rationale: this is the official FunASR/SenseVoice runtime path and keeps model loading local. Date/Author: 2026-06-17 / Codex.
- Decision: Reject unsupported ASR model IDs with structured errors. Rationale: ASR model strings are local runtime configuration, not arbitrary remote service identifiers. Date/Author: 2026-06-17 / Codex.

## Outcomes & Retrospective

Implemented ASR model selection behind the existing local ASR gate. Settings now persists `FRAMEQ_ASR_MODEL`, Tauri validates and applies the saved model before spawning the worker, and the Python worker routes `iic/SenseVoiceSmall` and `Qwen/Qwen3-ASR-0.6B` through the correct transcriber. SenseVoice uses `funasr.AutoModel`, while unsupported model IDs return structured ASR errors. The default ASR model is now `iic/SenseVoiceSmall`.

Validation passed: `uv run pytest worker\tests`, `uv run ruff check worker`, `cargo test --manifest-path app\src-tauri\Cargo.toml`, `npm --prefix app test`, `npm --prefix app run build`, `npm --prefix app run tauri -- build --no-bundle`, and `python scripts\validate_agents_docs.py --level WARN`.

Validation notes: `cargo fmt --manifest-path app\src-tauri\Cargo.toml --check` could not run because the local Rust toolchain lacks `rustfmt`; `npm --prefix app run lint` could not run because `app/package.json` has no `lint` script.

## Context and Orientation

- `worker/frameq_worker/asr.py` owns ASR adapters, model cache resolution, transcript writing, and current Qwen adapter.
- `worker/frameq_worker/cli.py` parses worker requests, merges project `.env`, builds real ASR when enabled, and emits progress events.
- `app/src-tauri/src/lib.rs` owns settings persistence and process spawning.
- `app/src/settingsClient.ts` maps Tauri settings commands into frontend state.
- `app/src/App.tsx` owns the settings modal UI.
- `app/src/workerClient.ts` constructs the process request with the default ASR model.

## Plan of Work

1. Worker:
   - Add supported ASR model metadata for Qwen and SenseVoice Small.
   - Add `SenseVoiceTranscriber` that wraps `funasr.AutoModel`.
   - Add `build_asr_transcriber` and use it from the CLI instead of the Qwen-specific builder.
   - Add `FRAMEQ_ASR_MODEL` resolution so `.env` can override the request model.
   - Return structured ASR errors for unsupported model IDs or missing SenseVoice dependency.
2. Tauri:
   - Add `FRAMEQ_ASR_MODEL` to config read/save.
   - Validate saved ASR model against supported options.
   - Override `ProcessVideoRequest.model` from saved config before spawning the worker.
   - Cover ASR config read/save and request override with Rust tests.
3. Frontend:
   - Add ASR model to settings client types/tests.
   - Render an ASR model select in the settings modal.
   - Keep the process client default as Qwen while relying on Tauri config override for saved user choice.
4. Docs and validation:
   - Keep product/design/security/architecture/task docs synced.
   - Run worker, Rust, frontend, docs, web build, and Tauri no-bundle checks.

## Validation and Acceptance

- `uv run pytest worker\tests` passes.
- `cargo test --manifest-path app\src-tauri\Cargo.toml` passes.
- `npm --prefix app test` passes.
- `npm --prefix app run build` passes.
- `npm --prefix app run tauri -- build --no-bundle` passes.
- `python scripts\validate_agents_docs.py --level WARN` passes.
- Manual follow-up: save SenseVoice Small in settings, restart/run with `FRAMEQ_ALLOW_REAL_ASR=1`, and confirm the transcript markdown shows `iic/SenseVoiceSmall`.
