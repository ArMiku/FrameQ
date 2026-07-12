# History Task Permanent Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not commit or push without a separate user request.

> This ExecPlan is a living document. Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective must be updated while work proceeds.

**Goal:** Add an explicit, safe-by-boundary permanent-delete action for supported History vNext tasks that immediately removes the task directory and its playback cache.

**Architecture:** Keep task identity ownership in `useTaskProcessingController`, History list/detail/delete orchestration in `useHistoryController`, and all path derivation plus destructive filesystem mutation in a new focused Rust `history_deletion` module. IPC accepts only `task_id`; Rust reuses strict History vNext manifest validation, refuses active worker/AI and linked storage, removes rebuildable cache before the task root, and returns success only after the task root is absent.

**Tech Stack:** React 19, TypeScript, Tauri 2, Rust standard filesystem APIs, Vitest controller/source tests, existing deterministic Chromium CDP smoke, Rust temporary-directory and failure-injection tests.

---

## Purpose / Big Picture

Users need to reclaim disk space occupied by completed task video, audio, transcripts, and AI
artifacts. The operation is intentionally permanent and irreversible. It must not weaken History
vNext's strict boundary, accept frontend paths, touch unsupported legacy data, race a running
worker or transcript save, or claim rollback that recursive deletion cannot provide.

## Progress

- [x] 2026-07-12: Inspected current History vNext list/detail APIs, task-manifest validation,
  workflow-owned restoration, ProcessSupervisor state, History UI structure, and per-task audio
  playback cache. Validation: read-only source and document inspection.
- [x] 2026-07-12: User selected permanent deletion instead of system Trash and explicitly
  accepted the residual risk that recursive deletion may partially complete. Validation: written
  product decision.
- [x] 2026-07-12: Product specification, durable architecture/design/security boundaries, task
  entry, and active ExecPlan created. Validation: docs checker 0 errors / 0 warnings.
- [x] 2026-07-12: Completed RED/GREEN implementation for strict task-id-only IPC, Rust filesystem
  deletion, controller-owned confirmation and lifecycle handling, current-task playback release,
  accessible History UI, and deterministic browser smoke.
- [x] 2026-07-12: Adversarial review added rejection of linked/junction task and playback-cache
  ancestor roots, in addition to linked descendants. Windows temporary-root, locked-file, partial
  failure, overlap, and exact-scope tests passed.
- [x] 2026-07-12: Local full gates passed: app 35 files / 256 tests, browser 23/23 in three
  consecutive isolated runs, Rust 104/104, worker 231/231, Ruff, server test/build, app build,
  docs 0/0, and diff check. macOS native deletion evidence remains pending.
- [x] 2026-07-12: GitHub-hosted Intel macOS run `29187106602`, job `86635119860`, passed the
  complete native Cargo suite 103/103 at commit `eb5ed4122c0c8a8e66cebfddd03110629dce564f`.
  Real temporary-directory deletion, dangling symlink, linked task/cache roots, and Unix process
  group fixtures all executed as `ok`.

## Surprises & Discoveries

- History cards are currently whole-row buttons. An independent delete button requires a neutral
  card container with sibling restore and delete buttons; nesting a button would be invalid and
  inaccessible.
- Audio playback copies live outside the task directory at
  `cache/.frameq-audio-review/<task-id>`, so deleting only the task root would leave duplicate
  audio data and disk usage behind.
- ProcessSupervisor currently exposes phase/current inspection only in tests. Deletion needs a
  minimal production-safe read-only active predicate; it must not change cancellation semantics.
- Transcript save is independent from the worker ProcessSupervisor and can recreate or rewrite
  task files. Normal product flow must disable deletion while a save is active and invalidate
  late save/detail callbacks after success.
- Rust recursive deletion is not transactional. Failure injection must assert real filesystem
  remnants and sanitized UI truth rather than pretending the operation rolled back.
- The original CDP helper navigated every target to the app twice and could consume a stale load
  event. Single-navigation startup plus fresh browser isolation between scenario groups removed
  the moving 15-second timeout without increasing test timeouts or adding sleeps.
- Canonicalizing a child is insufficient if `outputs/tasks` or the playback-cache parent is
  itself a link/junction. Every ancestor storage directory used for deletion now receives an
  explicit no-link/reparse-point check before mutation.

## Decision Log

- Decision: Permanently delete rather than use Windows Recycle Bin or macOS Trash.
  Rationale: user prioritizes immediate disk release and accepts irreversible partial-failure
  risk. Date/Author: 2026-07-12 / User + Codex.
- Decision: Accept only task ID at IPC and derive every path in Rust. Rationale: frontend paths
  would break the established task-root security boundary. Date/Author: 2026-07-12 / User + Codex.
- Decision: Put destructive filesystem logic in `history_deletion.rs`. Rationale: history list
  projection and detail reads remain simple, while deletion receives focused failure-injection
  tests and no generic path API. Date/Author: 2026-07-12 / Codex.
- Decision: Delete rebuildable playback cache before the primary task root. Rationale: cache
  failure can abort without touching authoritative artifacts; cache loss before a later primary
  failure is recoverable. Date/Author: 2026-07-12 / User + Codex.
- Decision: Do not introduce app-owned trash, tombstones, background cleanup, or legacy cleanup.
  Rationale: those would contradict immediate permanent deletion and expand History vNext beyond
  current safe tasks. Date/Author: 2026-07-12 / User + Codex.
- Decision: Keep browser smoke serial but restart headless Chromium between semantic scenario
  groups. Rationale: this provides deterministic isolation while retaining real React/DOM/CDP
  behavior and observable readiness conditions. Date/Author: 2026-07-12 / Codex.

## Outcomes & Retrospective

The local implementation is complete and all Windows/local project gates pass. The product sends
only `task_id`; Rust accepts only current safe History vNext manifests, rejects linked/reparse
roots and descendants, deletes per-task playback cache before the authoritative task directory,
and returns success only after the task root is absent. The browser flow confirms cancel performs
zero calls, three explicit attempts produce exactly three task-id-only IPC calls, non-current
success preserves the current workspace, failure retains/reloads disk-derived History without
showing raw error material, and current success resets only after confirmation.

Windows native filesystem evidence is provided by temporary-root tests using real
`remove_dir_all`, a no-delete-sharing locked artifact, and actual junction fixtures. Intel macOS
evidence is provided by hosted run `29187106602`: 103/103 Cargo tests passed, including
`deletes_only_the_supported_task_and_its_playback_cache`,
`rejects_dangling_playback_cache_symlink_before_task_removal`,
`rejects_linked_tasks_root_before_removal`, and
`rejects_linked_playback_cache_root_before_task_removal`. The accepted residual risk remains:
recursive removal is irreversible and non-transactional, so interruption or an OS error may leave
only part of the selected task.

## Context and Orientation

- Product spec: `docs/product-specs/2026-07-12-history-task-permanent-deletion.md`.
- History Rust list/detail: `app/src-tauri/src/history.rs`.
- Task validation: `app/src-tauri/src/task_manifest.rs`.
- Process supervisor: `app/src-tauri/src/worker_command.rs`.
- Tauri state and command registration: `app/src-tauri/src/lib.rs`.
- History IPC mapping: `app/src/historyClient.ts` and `app/src/historyClient.test.ts`.
- History controller: `app/src/features/history/useHistoryController.ts` and its test.
- Workflow controller: `app/src/features/workflow/useTaskProcessingController.ts` and
  `app/src/features/workflow/useTaskProcessingController.test.ts`; it remains the sole
  task-identity owner.
- History UI: `app/src/features/history/HistorySheet.tsx`, `app/src/App.css`, source/CSS contracts,
  and `app/tests/app-input.browser.test.ts`.
- Playback cache layout: `app/src-tauri/src/transcript_detail.rs` and `settings.rs`.

## Plan of Work

### Task 1: Specify the Rust deletion boundary with failing filesystem tests

**Files:**
- Create: `app/src-tauri/src/history_deletion.rs`
- Modify: `app/src-tauri/src/task_manifest.rs`
- Modify: `app/src-tauri/src/worker_command.rs`
- Test: `app/src-tauri/src/history_deletion.rs`

- [x] **Step 1: Add a failing safe-task deletion test**

Define an injectable removal boundary and wished-for domain function in the test module:

```rust
trait DirectoryRemover {
    fn remove_dir_all(&self, path: &Path) -> Result<(), ()>;
}

fn delete_history_task_from_roots<R: DirectoryRemover>(
    output_root: &Path,
    cache_root: &Path,
    task_id: &str,
    remover: &R,
) -> Result<HistoryDeleteResult, HistoryDeleteError>;
```

Create a valid schema-v3 task containing `media/video.mp4`, `media/audio.wav`,
`transcript/transcript.txt`, `transcript/segments.json`, `transcript/original/transcript.txt`,
`ai/summary.md`, `ai/mindmap.mmd`, `ai/insights.json`, and `frameq-task.json`. Create playback
cache for that task and another task. Assert the target task and cache disappear, while the other
task/cache and both roots remain.

- [x] **Step 2: Run the focused Rust test and verify RED**

```powershell
cargo test --manifest-path app\src-tauri\Cargo.toml history_deletion::tests::deletes_only_the_supported_task_and_its_playback_cache
```

Expected: compile/test failure because `history_deletion` and its domain API do not exist.

- [x] **Step 3: Add failing strict-boundary cases**

Add table-driven tests for schema v1/v2, missing privacy marker, quarantined, malformed manifest,
manifest/request ID mismatch, `../` task ID, root symlink, descendant symlink, Windows reparse
point/junction under `cfg(windows)`, and macOS symlink under `cfg(unix)`. Use a recording remover
and assert it receives zero calls. Assert errors are fixed variants, not raw paths or fixture
content.

- [x] **Step 4: Add failure-order tests**

Use a remover that fails on a configured call:

```rust
assert_eq!(error, HistoryDeleteError::DeleteFailed);
assert!(task_dir.exists()); // cache failure aborts before task mutation
```

For primary deletion failure, configure cache removal to succeed and task removal to fail. Assert
the cache may be absent, the task's actual remaining state is reported honestly, and serialized
errors contain neither paths nor `review-secret`.

- [x] **Step 5: Add the minimal safe implementation**

Implement focused types:

```rust
#[derive(Debug, Serialize, PartialEq, Eq)]
pub(crate) struct HistoryDeleteResult {
    pub(crate) task_id: String,
    pub(crate) deleted: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum HistoryDeleteError {
    Busy,
    Unavailable,
    UnsafeStorage,
    DeleteFailed,
}
```

Reuse strict manifest loading and `source_privacy_ready()`. Add a task-manifest helper that walks
with `symlink_metadata` without following entries and rejects links/reparse points. Validate exact
root relationships before calling the remover. Production `StdDirectoryRemover` delegates only
to `std::fs::remove_dir_all`.

- [x] **Step 6: Add a read-only supervisor predicate**

Add:

```rust
pub(crate) fn is_active(&self) -> bool {
    self.state
        .lock()
        .expect("process supervisor lock poisoned")
        .current
        .is_some()
}
```

Test Running, Cancelling, and Finished without changing start/cancel/finish behavior.

- [x] **Step 7: Run focused Rust tests and verify GREEN**

```powershell
cargo test --manifest-path app\src-tauri\Cargo.toml history_deletion
cargo test --manifest-path app\src-tauri\Cargo.toml process_supervisor
```

Expected: all focused deletion and existing supervisor tests pass.

### Task 2: Expose a strict Tauri command without path or error leakage

**Files:**
- Modify: `app/src-tauri/src/history_deletion.rs`
- Modify: `app/src-tauri/src/lib.rs`
- Test: `app/src-tauri/src/history_deletion.rs`

- [x] **Step 1: Write failing request/command contract tests**

Define a strict request:

```rust
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct HistoryDeleteRequest {
    #[serde(alias = "taskId")]
    task_id: String,
}
```

Assert JSON containing `task_dir`, `output_dir`, `url`, or another unknown field is rejected.
Assert fixed public mappings exactly equal `HISTORY_DELETE_BUSY`,
`HISTORY_DELETE_UNAVAILABLE`, `HISTORY_DELETE_UNSAFE_STORAGE`, or `HISTORY_DELETE_FAILED`.

- [x] **Step 2: Verify RED**

Run:

```powershell
cargo test --manifest-path app\src-tauri\Cargo.toml history_delete_request
```

Expected: FAIL until strict DTO and fixed mappings exist.

- [x] **Step 3: Implement the command and delete serialization**

Add a focused `HistoryDeletionState` containing one `Mutex<()>`, manage it in `lib.rs`, and register
`history_deletion::delete_history_task`. The command accepts `AppHandle`, managed
`ProcessSupervisors`, managed deletion state, and `HistoryDeleteRequest`. It uses `try_lock` to
return Busy for a duplicate, rejects `process_supervisors.video.is_active()`, resolves runtime
paths, and invokes the domain function. It logs only:

```text
history.delete outcome=completed elapsed_ms=<number>
```

or a fixed rejected outcome. Do not log task ID, path, URL, filename, manifest, or OS error.

- [x] **Step 4: Run the full Rust suite**

```powershell
cargo test --manifest-path app\src-tauri\Cargo.toml
```

Expected: all Rust tests pass on Windows; macOS-specific link behavior remains conditionally
compiled for macOS CI/native validation. Existing ProcessSupervisor cancellation tests remain
unchanged.

### Task 3: Add typed frontend deletion orchestration with stale-response guards

**Files:**
- Modify: `app/src/historyClient.ts`
- Modify: `app/src/historyClient.test.ts`
- Modify: `app/src/features/history/useHistoryController.ts`
- Modify: `app/src/features/history/useHistoryController.test.ts`
- Modify: `app/src/features/workflow/useTaskProcessingController.ts`
- Modify: `app/src/features/workflow/useTaskProcessingController.test.ts`
- Modify: `app/src/App.tsx`

- [x] **Step 1: Write failing history client tests**

Specify:

```ts
await deleteHistoryTask("task-safe-1", runner);
expect(calls).toEqual([{
  command: "delete_history_task",
  args: { request: { task_id: "task-safe-1" } },
}]);
```

The mapper accepts only `{ task_id, deleted: true }`; it does not send list DTO paths or URLs.

- [x] **Step 2: Write failing History controller tests**

Cover confirmation open/cancel, one pending request, detail request invalidation, success removal,
failure list retention/reload, and fixed user copy. Specify semantic actions such as:

```ts
requestHistoryItemDeletion(item);
cancelHistoryItemDeletion();
confirmHistoryItemDeletion();
```

Assert cancellation performs no IPC and a second confirmation while pending performs one call.

- [x] **Step 3: Write failing workflow-owner tests**

Add a narrow semantic action:

```ts
completeHistoryTaskDeletion(deletedTaskId: string): void
```

Assert a non-current deletion does not change workflow. Assert a matching stable task invalidates
the operation, resets task-scoped transient UI, and returns to input. Assert processing, AI retry,
cancelling, and transcript-saving states expose one shared `canDeleteHistoryTask === false`
predicate and explanation.

- [x] **Step 4: Verify frontend RED**

```powershell
npm --prefix app test -- src/historyClient.test.ts
npm --prefix app test -- src/features/history/useHistoryController.test.ts
npm --prefix app test -- -t "history task deletion"
```

Expected: FAIL because the client and semantic actions do not exist.

- [x] **Step 5: Implement the minimal client/controller flow**

Implement only the typed command, confirmation state, pending flag, list removal/reload, and
workflow semantic completion. Before deleting the current task, call the existing transcript
detail controller's narrow pause/release action; do not expose generic setters. Increment the
History detail request ID before deletion and invalidate task-save/operation callbacks only after
confirmed success.

- [x] **Step 6: Verify focused GREEN**

Run the same three commands. Expected: all focused tests pass.

### Task 4: Build accessible sibling controls and confirmation UI

**Files:**
- Modify: `app/src/features/history/HistorySheet.tsx`
- Modify: `app/src/features/history/HistorySheet.test.tsx`
- Modify: `app/src/App.css`
- Modify: `app/src/App.css.test.ts`

- [x] **Step 1: Write failing DOM/source and CSS contracts**

Assert `.history-item` is a neutral container and contains sibling controls:

```tsx
<div className={`history-item ${item.status}`}>
  <button className="history-item-select" type="button" />
  <button className="history-item-delete" type="button" />
</div>
```

Assert no button contains another button. Assert the delete control has
`aria-label="永久删除此历史任务"`, `title="永久删除"`, a `Trash2` icon, native disabled state,
and restrained danger hover/focus. Assert existing title clamp, metadata grid, intrinsic card
height, and narrow layout remain.

- [x] **Step 2: Verify RED**

```powershell
npm --prefix app test -- src/App.css.test.ts
```

Expected: FAIL because the history row is currently one whole-row button.

- [x] **Step 3: Implement minimal row and dialog markup**

Keep restore content inside `.history-item-select`; place the 32x32 delete button as a sibling.
Render a dialog with Cancel as initial focus, descriptive irreversible copy, and one red
`永久删除` action. Escape closes only the confirmation. While pending, disable both actions and
show `正在永久删除`.

- [x] **Step 4: Implement scoped layout and interaction styles**

Preserve current History intrinsic sizing. Use a two-column card layout
`minmax(0, 1fr) 32px`, align the delete control to the card's top/right action region, and stack or
retain containment below 720px. Do not add animation beyond existing hover/focus transitions and
respect reduced motion.

- [x] **Step 5: Verify focused GREEN**

```powershell
npm --prefix app test -- src/App.css.test.ts
```

Expected: PASS with existing History layout assertions retained.

### Task 5: Add deterministic browser smoke for real React state ownership

**Files:**
- Modify: `app/tests/app-input.browser.test.ts`

- [x] **Step 1: Extend the mock bridge with delete control**

Add deterministic `delete_history_task` responses that record command count and can be deferred,
resolved, or rejected. Do not read real files, launch worker/server, use network, LLM, payment, or
render sensitive URLs.

- [x] **Step 2: Add stable-task success and failure smoke**

Cover:

- cancel confirmation causes zero delete calls;
- successful non-current deletion removes one card without changing current task ID;
- successful current deletion resets to input only after command completion;
- rejected deletion retains card/current workspace and displays fixed copy;
- a deferred old detail or save response cannot reinstall a successfully deleted task.

- [x] **Step 3: Add active-state and accessibility smoke**

At processing, AI retry, cancelling, and transcript-saving states assert delete controls are
native disabled and reference readable reason copy. Verify Tab reaches the enabled delete button,
Enter opens confirmation, default focus is Cancel, Escape closes only confirmation, and narrow
viewport geometry is contained.

- [x] **Step 4: Run the complete serial browser file**

```powershell
npm --prefix app test -- tests/app-input.browser.test.ts
```

Expected: every browser smoke passes without fixed sleeps or external dependencies.

### Task 6: Documentation, cross-platform validation, and plan closure

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DESIGN.md`
- Modify: `docs/SECURITY.md`
- Modify: `docs/exec-plans/tech-debt-tracker.md`
- Modify: `TASKS.md`
- Modify: this ExecPlan
- Move after all gates: this plan from `active/` to `completed/`
- Modify after all gates: active/completed indexes and product-spec status

- [x] **Step 1: Run full project gates**

```powershell
npm --prefix app test
npm --prefix app run build
cargo test --manifest-path app\src-tauri\Cargo.toml
uv run pytest worker\tests
uv run ruff check worker
npm --prefix server test
npm --prefix server run build
python scripts\validate_agents_docs.py --level WARN
git diff --check
git status --short
```

Expected: all suites and builds pass; no worker/server/payment behavior changes; only approved
app/Rust/docs files are modified.

- [x] **Step 2: Perform native Windows acceptance**

Using temporary task roots only, verify a stable current and non-current task delete completely,
an externally opened/locked artifact returns the fixed partial-failure message, playback is
released before current-task deletion, and no path outside the temporary task/cache roots changes.
Record exact counts without printing task paths or fixture secrets.

- [x] **Step 3: Perform native macOS acceptance before release**

Run the Rust suite and the same temporary-root deletion smoke on macOS arm64/x64 release hosts.
Verify symlink rejection and `remove_dir_all` behavior. If macOS evidence is unavailable in the
implementation session, keep the item open and report it as a release blocker rather than
claiming cross-platform validation.

- [x] **Step 4: Close the plan only after evidence exists**

Record RED/GREEN outputs, full counts, Windows/macOS evidence, partial-failure observations, and
the accepted non-transactional deletion risk. Mark TASKS complete, archive this plan, and update
both ExecPlan indexes. Do not commit or push without separate user authorization.

## Validation and Acceptance

- Focused Rust history deletion and ProcessSupervisor tests.
- Focused history client, controller, workflow-owner, component/CSS tests.
- Complete deterministic Chromium browser smoke.
- Full App, Rust, Worker, Server, docs, and diff gates listed above.
- Native Windows and macOS temporary-root deletion evidence.

Acceptance requires permanent deletion of only the selected supported task and its cache, strict
rejection of unsupported/linked storage, truthful partial-failure behavior, no task reset before
confirmed success, no stale callback resurrection, accessible confirmation, no external services,
and no modifications to worker, SourceIdentity, server, LLM, entitlement, billing, or payment.
