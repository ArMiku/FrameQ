# History Task Restore Ownership ExecPlan

> Completed 2026-07-10. This record retains the decisions, validation evidence, and residual risk for the history task-restore P1.

## Purpose / Big Picture

Prevent a history selection from bypassing the workflow controller and racing an active video, AI retry, or cancellation. A user can view history during an active task, but only a stable workflow can restore one complete prior task through the controller's operation-ID boundary.

## Progress

- [x] 2026-07-10: Read governance, architecture/design/security, active plans, related product specs, technical debt, and the current dirty worktree. Confirmed the direct App history setter and shared raw setter passed to transcript detail.
- [x] 2026-07-10: Created the product spec and active ExecPlan before TDD. Scope excluded WeChat Pay, entitlement work, and ProcessSupervisor implementation details.
- [x] 2026-07-10: Added controller and history-sheet red tests. Focused Vitest runs failed before implementation for absent `restoreHistoryItem` / `updateUrlDraft` actions and absent disabled-row reason.
- [x] 2026-07-10: Replaced external generic workflow mutation with controller-owned URL draft, stable-history restore, and expected-task-ID transcript-save actions. Focused controller/history/App tests passed (22 tests).
- [x] 2026-07-10: Synchronized product, architecture, design, security, task, and technical-debt records; ran all requested gates; archived this plan and removed temporary planning files.

## Surprises & Discoveries

- `useTaskProcessingController` already had an operation-ID guard but returned raw `setWorkflow`. App used that setter for URL editing and direct task identity replacement; transcript detail used it for a task-local save.
- `isProcessingStage` already represents video processing, AI retry, and `cancelling`, so it is the single predicate for restore availability rather than a duplicated UI/CSS rule.
- The first TypeScript build after the API contraction exposed stale test fixtures using a non-existent Insight shape and one missing App callback parameter type. Aligning the fixture with the actual contract and restoring the local `SetStateAction` import fixed only test/type wiring; no product behavior was relaxed.

## Decision Log

- Keep the history panel available while activity is in progress, but render task rows disabled/read-only with a clear reason. This preserves browsing without allowing a task-identity race. (2026-07-10)
- Use three narrow controller actions: waiting-input URL update, guarded history restore, and expected-task-ID transcript-save application. This preserves editing without allowing arbitrary task replacement. (2026-07-10)
- Reject restoration instead of cancelling a worker and immediately switching. This preserves truthful cancellation semantics and lets the current task publish its real terminal result. (2026-07-10)

## Outcome

`useTaskProcessingController` is now the sole owner of workflow task identity. A stable history restore invalidates the old operation, clears task-scoped detail/preference/notice UI through the existing reset callback, and installs one history item as a complete identity. Active video, AI retry, and cancelling states reject restore requests without touching the current operation. Transcript saves are applied only when their expected task remains current. `rg` confirms raw `setWorkflow` is private to the controller in production code.

The remaining known history risk is only concurrent history-list fetch ordering, tracked in `docs/exec-plans/tech-debt-tracker.md`; it is not a task-identity or stale-worker overwrite path.

## Validation

- `npm --prefix app test` — 31 files, 205 tests passed.
- `npm --prefix app run build` — passed.
- `cargo test --manifest-path app\src-tauri\Cargo.toml` — 85 tests passed.
- `uv run pytest worker\tests` — 244 tests passed; one existing Python 3.13 `audioop` deprecation warning remains tracked.
- `uv run ruff check worker` — passed.
- `npm --prefix server test` — 12 files, 57 tests passed.
- `npm --prefix server run build` — passed.
- `python scripts\validate_agents_docs.py --level WARN` — passed with 0 errors and 0 warnings.
- `git diff --check` — passed.
- `git status --short` — run at final handoff; all existing unrelated dirty changes preserved.
