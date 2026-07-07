# Task-Owned Artifact Layout ExecPlan

## Purpose

Replace FrameQ's flat output/history contract with one task-owned directory per processing run. New tasks should be easier to inspect, copy, delete, and reason about because all final artifacts live together under `<FRAMEQ_OUTPUT_DIR>/tasks/<task_id>/`, while temporary files remain in app-local `cache/tasks/<task_id>/`.

This change intentionally does not preserve old flat-output tasks or legacy app-local history records.

## Progress

- [x] 2026-07-05: Product, architecture, security, and design boundaries documented before runtime work.
- [x] 2026-07-05: Worker creates task context, stable artifact paths, and `frameq-task.json`.
- [x] 2026-07-05: Tauri reads task manifests for history, transcript review, transcript save, and insight retry.
- [x] 2026-07-05: Frontend stores task identity/artifacts instead of loose result paths.
- [x] 2026-07-05: Validation commands pass or residual risks are documented.

## Surprises

- 2026-07-05: Baseline `npm --prefix app test` has one existing Vitest dynamic-import failure for `scripts/build-installer.mjs`; Node's native dynamic import succeeds. Worker and Rust baselines pass.
- 2026-07-05: The Vitest dynamic-import failure was isolated to the test harness. The installer script itself parsed and imported under Node, so the test now executes that import in a child Node process instead of through Vitest's transform layer.
- 2026-07-05: Re-submitting the same source URL exposed that task-owned history did not yet short-circuit worker launch. Tauri now reuses the newest usable completed or partial-completed task for the exact URL before spawning the worker.
- 2026-07-05: The app-local temporary task area now uses `cache/`; new builds use `FRAMEQ_CACHE_DIR` and do not preserve the legacy worker env contract.
- 2026-07-05: The toolbar new-task action could terminate a running task too easily. It is now treated as unavailable during active processing; explicit task cancellation stays in the task monitor.

## Decision Log

- 2026-07-05: New builds ignore legacy app-local history and flat output files. No migration, backfill, or compatibility UI is required.
- 2026-07-05: `frameq-task.json` is the source of truth. Any app-local index is a rebuildable cache.
- 2026-07-05: Stable filenames inside task directories are preferred over preserving platform downloader stems.
- 2026-07-05: Tauri task commands should accept `task_id` and resolve manifest artifacts internally, not accept arbitrary transcript/audio paths.
- 2026-07-05: URL reuse lives in Tauri, not the worker. The worker still creates a new task for every real processing run; Tauri decides whether an existing manifest is good enough to return before launch.
- 2026-07-05: App-local temporary task files are a cache, not durable output. The desktop-worker contract uses `FRAMEQ_CACHE_DIR`, and the legacy temporary-dir env name is intentionally not kept.
- 2026-07-05: Existing legacy app-local temporary directories are removed during runtime directory setup, with no migration or compatibility fallback.
- 2026-07-05: FrameQ remains a single-task UI. Background task continuation after toolbar reset is out of scope; the safer v1 behavior is to disable the toolbar new-task button while processing.

## Plan of Work

1. Worker task store
   - Add task id generation and `TaskContext/TaskPaths`.
   - Write final media, audio, transcript, segments, summary, mindmap, and insights through stable task-relative paths.
   - Write and update `frameq-task.json` on success, partial completion, and failure.
   - Return `task_id`, `task_dir`, and manifest-relative `artifacts` in worker JSON.

2. Tauri task boundary
   - Pass output root and cache root to worker, and expect task-shaped worker results.
   - Replace legacy local history loading with manifest discovery under `<output_root>/tasks/*/frameq-task.json`.
   - Change transcript detail load/save and insight retry payloads to use `task_id`.
   - Validate manifest-relative paths stay inside the task directory.

3. Frontend workflow
   - Update worker/history/detail clients and workflow state to store `taskId`, `taskDir`, and `artifacts`.
   - Keep command names stable while using new task-centric payloads.
   - Result cards, detail modal, retry AI整理, export, and locate use task artifacts rather than loose paths.
   - Remove old history compatibility assumptions from tests and UI copy.

4. Validation and cleanup
   - Update the desktop-worker contract fixture if shared result keys change.
   - Update tests across worker, Tauri, and frontend before implementation and keep them green.
   - Run full project verification before handoff.

## Validation

- Documentation
  - `python scripts\validate_agents_docs.py --level WARN`
  - `git diff --check`
- Worker
  - Task id generation is stable enough for filesystem use and includes platform/source context where available.
  - New tasks write no final artifacts directly into the output root.
  - Manifest records completed, partial, and failed task states.
  - Insight retry reads the saved transcript from the task manifest and writes AI artifacts under the same task.
  - `uv run pytest worker\tests`
  - `uv run ruff check worker`
- Tauri
  - History is built from task manifests.
  - Transcript load/save resolve by `task_id` and reject traversal or cross-task paths.
  - Save creates original backups under `transcript/original/` and updates the manifest preview.
  - `cargo test --manifest-path app\src-tauri\Cargo.toml`
- Frontend
  - New worker results map into task-centric workflow state.
  - History items restore task-centric workflow state.
  - Transcript detail load/save and insight retry call task-centric payloads.
  - Result card location uses manifest artifact paths.
  - `npm --prefix app test`
  - `npm --prefix app run build`

## Validation Log

- 2026-07-05: `cargo test --manifest-path app\src-tauri\Cargo.toml` passed after Tauri task-boundary changes.
- 2026-07-05: `npm --prefix app test` passed with 111 tests.
- 2026-07-05: `npm --prefix app run build` passed.
- 2026-07-05: `uv run pytest worker\tests` passed with 126 tests.
- 2026-07-05: `uv run ruff check worker` passed.
- 2026-07-05: `npm --prefix app run tauri -- build --no-bundle` passed.
- 2026-07-05: `python scripts\validate_agents_docs.py --level WARN` passed with 0 warnings.
- 2026-07-05: `git diff --check` passed; Git only printed CRLF conversion warnings.
- 2026-07-05: `npm --prefix app run lint` could not run because `app/package.json` has no `lint` script.
- 2026-07-05: Toolbar new-task guard TDD red check failed in `npm --prefix app test -- workflow.test.ts` because `getToolbarNewTaskButtonState` did not exist.
- 2026-07-05: `npm --prefix app test -- workflow.test.ts` passed with 18 tests after adding toolbar new-task guard behavior.
- 2026-07-05: `npm --prefix app test` passed with 112 tests.
- 2026-07-05: `npm --prefix app run build` passed.
- 2026-07-05: `python scripts\validate_agents_docs.py --level WARN` passed with 0 warnings after toolbar new-task guard docs.
- 2026-07-05: `git diff --check` passed after toolbar new-task guard docs and frontend changes; Git only printed CRLF conversion warnings.
- 2026-07-05: Current source, README, product docs, active plans, contracts, and tests no longer reference the legacy temporary path or old worker env name; only completed historical plans retain old evidence.
- 2026-07-05: `cargo test --manifest-path app\src-tauri\Cargo.toml` passed with 43 tests after the cache terminology cleanup.
- 2026-07-05: `uv run pytest worker\tests` passed with 127 tests after the cache terminology cleanup.
- 2026-07-05: Runtime setup now removes existing legacy app-local temporary directories; `cargo test --manifest-path app\src-tauri\Cargo.toml` passed with 43 tests after adding the cleanup assertion.
- 2026-07-05: Current source/docs/tests search for legacy path spelling and old worker env names returned no matches; the repository-root legacy temporary directory was removed locally.
