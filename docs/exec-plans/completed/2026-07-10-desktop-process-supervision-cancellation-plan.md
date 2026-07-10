# Desktop Process Supervision and Cancellation ExecPlan

> This ExecPlan is a completed record. The sections Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective preserve the implementation and validation evidence.

## Purpose / Big Picture

Make cancellation truthful and complete: a visible task remains active while cancellation is in progress, worker/model-download descendant processes are terminated as a tree/group, and a natural result that wins the race remains visible. Existing partial artifacts stay on disk.

## Progress

- [x] 2026-07-10: Read governance, architecture, design, security, active plans, relevant product/runtime sources, frontend state, tests, and the actual dirty worktree. Validation: confirmed cancellation is currently duplicated and PID-only.
- [x] 2026-07-10: Created product specification and this active ExecPlan before implementation. Validation: scope excludes server billing/entitlement/admin changes and records Unix live-test limits.
- [x] 2026-07-10: Added failing Rust/TypeScript tests for cancellation claim/rollback, stale-instance protection, duplicate requests, Windows/Unix command construction, worker/ASR state semantics, and frontend cancellation lifecycle. Validation: the new failure-path tests initially failed against the old immediate-reset/PID-only implementation, then passed after the minimum implementation.
- [x] 2026-07-10: Implemented the shared supervisor and wired video worker, insight retry, and ASR model download through it. Validation: video/ASR now retain their current instance until terminal observation; Windows uses the fixed tree command and Unix creates a process group with TERM-to-KILL escalation.
- [x] 2026-07-10: Updated Rust/TypeScript contracts, architecture/design/security/task/technical-debt documentation, and ran complete gates. Validation: Rust 85, app 197, worker 244, and server 57 tests passed; app/server builds, worker ruff, docs validation, `cargo fmt --check`, and `git diff --check` passed.

## Surprises & Discoveries

- Evidence: `WorkerProcessState` and `ModelDownloadProcessState` separately marked a PID cancelled before calling termination, then cleared the current PID after signal success.
- Evidence: `spawn_worker_command` was already shared, but Unix termination called `kill -TERM <pid>` and therefore did not target worker descendants.
- Evidence: frontend `cancelCurrentProcessing` incremented its operation ID and reset the workflow before it awaited the cancellation IPC response.
- Evidence: frontend build initially caught every exhaustiveness/fixture consequence of adding the `cancelling` workflow stage. The root cause was the new required state field and union member, not a runtime cancellation defect; all explicit stage maps and test fixtures now cover the state.
- Evidence: this Windows environment has only the `x86_64-pc-windows-msvc` Rust target installed. The `cfg(unix)` real parent-plus-child process-group fixture is committed but cannot run here.
- Evidence: final source review found account sign-out calling the raw cancellation IPC then immediately resetting the workflow. It now routes through the same controller; a regression assertion prevents a second frontend cancellation path.

## Decision Log

- Decision: Use one standard-library/platform-native `ProcessSupervisor` abstraction rather than separate PID flags. Rationale: one owner can make cancellation claim/rollback/finalization instance-safe for both workloads. Date/Author: 2026-07-10 / User + Codex.
- Decision: On Unix give every worker a new process group and signal the negative PGID; on Windows retain `taskkill /T /F`. Rationale: this covers worker descendants without a shell or large dependency. Date/Author: 2026-07-10 / User + Codex.
- Decision: Treat a delivered signal as `Cancelling`, not a final cancelled result. Rationale: real terminal output wins completion races and prevents incorrect loss of late successes. Date/Author: 2026-07-10 / User + Codex.
- Decision: Keep separate video and ASR lanes in one `ProcessSupervisors` owner so an ASR first-run download does not block a video task, while both lanes use the exact same `ProcessSupervisor` state-machine implementation. Rationale: preserves existing concurrency policy without duplicating cancellation semantics. Date/Author: 2026-07-10 / Codex.

## Outcomes & Retrospective

Implemented and validated on Windows. `ProcessSupervisor` replaced both duplicated PID/cancelled-PID state holders; it protects every claim, rollback, and terminal cleanup by instance ID, and both video/retry worker and ASR download use it. IPC now returns structured `cancelling`, `already_cancelling`, `not_running`, or `failed` statuses; the terminal worker result remains the authority. Windows state-machine and command-construction tests ran on this host. Unix command construction is covered cross-platform as pure data; the live `cfg(unix)` parent-plus-child fixture is present but was not executable on this Windows host and remains release evidence debt until run on macOS/Linux.

## Context and Orientation

- Rust: `app/src-tauri/src/worker_command.rs`, `video_processing.rs`, `asr_model.rs`, and `lib.rs`.
- Frontend: `app/src/features/workflow/useTaskProcessingController.ts`, `app/src/workflowState.ts`, `app/src/features/asrModel/useAsrModelDownload.ts`, `app/src/modelDownloadState.ts`, `app/src/workerClient.ts`, and `app/src/settingsClient.ts`.
- Tests: Rust module tests plus `app/src/workflow.test.ts`, `app/src/modelDownloadState.test.ts`, controller tests, and client tests.
- Governance: `docs/product-specs/2026-07-10-desktop-process-supervision-cancellation.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, and `docs/SECURITY.md`.

## Plan of Work

1. Define supervisor instance/phase and platform command seams with red state/command tests.
2. Start worker commands in a Unix process group and terminate the managed tree/group through the supervisor.
3. Replace video and ASR PID state with the shared supervisor and preserve terminal race outcomes.
4. Add frontend `Cancelling` lifecycle/state helpers so cancellation waits for confirmed terminal outcome.
5. Test Windows and Unix construction, run Unix descendant fixture where supported, document platform limits, and run all gates.

## Validation and Acceptance

- Passed: `cargo test --manifest-path app\src-tauri\Cargo.toml` — 85 Rust tests (Windows host).
- Passed: `npm --prefix app test` — 30 files / 197 tests.
- Passed: `npm --prefix app run build` — TypeScript and Vite production build.
- Passed: `uv run pytest worker\tests` — 244 tests; one pre-existing Python 3.13 deprecation warning from `pydub`/`audioop` is recorded in technical debt.
- Passed: `uv run ruff check worker`, `npm --prefix server test` — 12 files / 57 tests, `npm --prefix server run build`, `python scripts\validate_agents_docs.py --level WARN` — 0 errors / 0 warnings, `cargo fmt --check`, and `git diff --check`.
- Not executed on this Windows host: the `cfg(unix)` live parent-plus-child fixture. It is compiled/executed only by a Unix Rust target and is explicitly retained as release validation debt.
