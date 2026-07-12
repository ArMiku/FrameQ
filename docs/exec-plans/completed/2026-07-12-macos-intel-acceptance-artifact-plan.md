# macOS Intel Acceptance Artifact Implementation Plan

> This ExecPlan is a living document. Progress, Surprises & Discoveries, Decision Log, and
> Outcomes & Retrospective must be kept up to date as work proceeds.

**Goal:** Run the complete Tauri Rust suite on a real GitHub-hosted Intel Mac and produce a
downloadable internal x86_64 FrameQ DMG without creating a release or requesting Apple credentials.

**Architecture:** Add one manual, read-only GitHub Actions workflow protected by a Node contract
test. The workflow runs the full x86_64 Cargo suite before reusing the existing macOS x64 runtime
preparation, app-bundle verification, and headless DMG packaging path, then uploads the DMG and a
SHA-256 file as a seven-day Actions Artifact.

**Tech Stack:** GitHub Actions, `macos-15-intel`, Node `node:test`, Rust/Cargo, Tauri v2, existing
installer scripts, `actions/upload-artifact@v4`, GitHub CLI.

---

## Progress

- [x] 2026-07-12: User approved an internal ad-hoc-signed Intel DMG rather than a Developer ID
  signed/notarized release package.
- [x] 2026-07-12: Verified from current GitHub documentation that `macos-15-intel` remains a
  supported x86_64 hosted runner and artifact retention can be configured per upload.
- [x] 2026-07-12: Created branch `codex/history-delete-macos-intel-acceptance` without discarding
  the existing permanent-deletion worktree and committed the approved design as `417f414`.
- [x] 2026-07-12: Added the workflow contract test first and observed the expected RED: one fixture
  check passed and the workflow contract failed with `ENOENT` because the YAML did not exist.
- [x] 2026-07-12: Added the minimal manual/read-only workflow and observed focused GREEN 2/2. All
  script contracts passed 11/11; the three required macOS x64 runtime secret names exist.
- [x] 2026-07-12: Local gates passed before push: app 256/256 plus build, Rust 104/104, worker
  231/231 plus Ruff, server 57/57 plus build, docs 0/0, and diff check.
- [x] 2026-07-12: The first manual dispatch attempt returned GitHub API 404 because a newly added
  workflow is not dispatchable until it exists on the default branch. User approved one temporary
  push trigger restricted to the exact acceptance branch; its contract was verified RED then 2/2
  GREEN and must be removed after the hosted run.
- [x] 2026-07-12: Hosted run `29186407302` passed the complete Intel Cargo suite, runtime resource
  preparation, and Tauri app build, then failed before packaging because the verification step
  hard-coded the bundle executable name. Added a RED contract for `CFBundleExecutable`, changed
  verification to resolve it from `Info.plist`, and restored focused GREEN 2/2.
- [x] 2026-07-12: Follow-up run `29187106602`, job `86635119860`, passed all 18 steps at commit
  `eb5ed4122c0c8a8e66cebfddd03110629dce564f`. Native Cargo passed 103/103; the x86_64 app,
  bundled runtime, Deno, ad-hoc codesign, DMG creation, checksum, and upload all passed.
- [x] 2026-07-12: Downloaded artifact `frameq-macos-intel-2-eb5ed4122c0c` (artifact ID
  `8258582095`) and independently verified `FrameQ_0.2.15_x64.dmg` at 509,419,917 bytes against
  SHA-256 `780ed6e62a52b993b928b243febbac945329497964fca95b0ddc692118b5bc79`.

## Task 1: Lock the workflow contract with TDD

**Files:**

- Create: `scripts/tests/macos-intel-acceptance-workflow.test.mjs`
- Create after RED: `.github/workflows/macos-intel-acceptance.yml`

- [x] **Step 1: Write the failing workflow contract test**

Require a manual-only workflow with `contents: read`, `macos-15-intel`, a bounded timeout, stable
toolchain setup, the exact x86_64 Cargo command, existing x64 resource preparation, app-only Tauri
build, architecture/import/code-sign checks, the existing headless DMG helper, SHA-256 generation,
and `actions/upload-artifact@v4` with seven-day retention and missing-file failure.

Also assert absence of push/tag/release triggers, `contents: write`, `gh release`, `tauri-action`,
Apple signing/notary credentials, payment/LLM variables, user-provided workflow inputs, and Linux.

- [x] **Step 2: Run the focused contract test and observe RED**

Run:

```powershell
node --test scripts/tests/macos-intel-acceptance-workflow.test.mjs
```

Expected: failure because `.github/workflows/macos-intel-acceptance.yml` does not exist.

- [x] **Step 3: Add the minimal workflow**

Create one `workflow_dispatch` job using only these repository secrets:

- `FRAMEQ_PYTHON_STANDALONE_URL_MACOS_X64`
- `FRAMEQ_FFMPEG_ARCHIVE_URL_MACOS_X64`
- `FRAMEQ_FFPROBE_ARCHIVE_URL_MACOS_X64`

Do not expose signing, updater, payment, LLM, or release secrets. Upload only `*.dmg` and
`*.dmg.sha256` from the x86_64 bundle directory.

- [x] **Step 4: Re-run the focused contract test and observe GREEN**

Run the same Node command. Expected: all assertions pass.

## Task 2: Verify locally before remote mutation

**Files:** no additional functional files unless a deterministic contract defect is found.

- [x] **Step 1: Validate workflow syntax and script contracts**

Run:

```powershell
node --test scripts/tests/*.test.mjs
npm --prefix app test
npm --prefix app run build
cargo test --manifest-path app/src-tauri/Cargo.toml
uv run pytest worker/tests
uv run ruff check worker
npm --prefix server test
npm --prefix server run build
python scripts/validate_agents_docs.py --level WARN
git diff --check
```

Expected: all existing deletion, source privacy, ProcessSupervisor, worker, server, app, and docs
gates pass. No workflow step executes provider APIs, payment, LLM, or user media downloads.

- [x] **Step 2: Inspect scope and repository prerequisites**

Confirm the current branch contains only the approved permanent-deletion changes, the design/plan,
the contract test, and the dedicated workflow. Confirm the three x64 runtime secret names exist via
GitHub metadata without reading their values. Confirm `.env`, task outputs, runtime downloads, and
build products are not staged.

## Task 3: Commit, push, and execute hosted acceptance

**Files:** all approved files from the permanent-deletion feature and this CI acceptance addition.

- [x] **Step 1: Commit the verified implementation**

Stage only approved source, test, workflow, and documentation files. Commit with a message that
describes permanent History deletion and Intel macOS acceptance. Do not amend or rewrite the design
commit.

- [x] **Step 2: Push the feature branch**

Push `codex/history-delete-macos-intel-acceptance` to `origin` without force.

- [x] **Step 3: Trigger the hosted workflow for the feature branch**

Run:

```powershell
gh workflow run macos-intel-acceptance.yml --ref codex/history-delete-macos-intel-acceptance
```

Resolve the newly created run ID from the exact branch and workflow, then monitor it to a terminal
result. Do not trigger `desktop-release.yml`.

- [x] **Step 4: Verify hosted logs and artifact**

Require the hosted log to show:

- runner label/image corresponding to Intel macOS;
- complete Cargo success and execution of macOS/Unix deletion-link fixtures;
- x86_64 executable architecture;
- bundled Python/worker and Deno smoke success;
- code-sign verification and DMG creation;
- artifact upload success.

Download the Actions Artifact to a temporary local directory, verify one DMG and one checksum file,
run a local SHA-256 comparison, and record artifact size without opening or executing the macOS
binary on Windows.

## Task 4: Record evidence and close plans

**Files:**

- Modify: `docs/exec-plans/active/2026-07-12-history-task-permanent-deletion-plan.md`
- Modify: this plan
- Modify: `docs/exec-plans/tech-debt-tracker.md`
- Modify: `TASKS.md`
- Move after green evidence: both completed plans to `docs/exec-plans/completed/`
- Modify: active/completed ExecPlan indexes

- [x] **Step 1: Record immutable hosted evidence**

Record run URL/ID, job ID, full commit SHA, runner label, Rust test count, named deletion/link tests,
artifact name, size, retention, and verified SHA-256. State explicitly that the DMG is ad-hoc-signed,
not notarized, and not production-release evidence.

- [x] **Step 2: Close macOS deletion validation debt**

Only after the hosted job and downloaded checksum are green, remove the pending macOS validation
debt, mark the permanent-deletion task complete, archive both plans, and update indexes. If the run
fails, keep both plans active and record the exact sanitized blocker instead.

- [x] **Step 3: Re-run documentation and diff gates, then push evidence**

Run docs validation and `git diff --check`, commit only the evidence/plan closure, and push without
force. Do not publish a release or merge to `main` in this task.

## Surprises & Discoveries

- A new `workflow_dispatch` file cannot be invoked until that workflow exists on the default
  branch. One exact-branch push trigger was used only to bootstrap hosted evidence and was removed
  immediately afterward.
- Tauri's `.app` product name and its `CFBundleExecutable` are independent. The first hosted build
  proved the app existed but the verification path was wrong; resolving the executable from
  `Info.plist` is both stricter and portable.
- The packaged runtime makes UDZO DMG compression the longest single step. It completed normally
  without Finder, AppleScript, a release, or notarization.

## Decision Log

- Decision: Use a dedicated artifact workflow instead of `desktop-release.yml`. Rationale: an
  acceptance build must not create/update a release or imply production readiness. Date: 2026-07-12.
- Decision: Build on `macos-15-intel`. Rationale: it is the current GitHub-supported standard Intel
  label and runs x86_64 tests natively. Date: 2026-07-12.
- Decision: Run Cargo before packaging in the same job. Rationale: the DMG and native deletion
  evidence then refer to the same commit, runner, and filesystem semantics. Date: 2026-07-12.
- Decision: Use repository runtime archive secrets but no Apple credentials. Rationale: the app
  bundle needs its normal embedded runtime, while internal acceptance does not justify Developer ID
  signing or notarization. Date: 2026-07-12.
- Decision: Bootstrap the first run with a temporary push trigger restricted to
  `codex/history-delete-macos-intel-acceptance`, then remove it after artifact verification.
  Rationale: GitHub rejects `workflow_dispatch` for a new workflow absent from the default branch;
  this preserves branch isolation without merging or creating a release. Date: 2026-07-12.

## Validation

- `node --test scripts/tests/macos-intel-acceptance-workflow.test.mjs`
- `node --test scripts/tests/*.test.mjs`
- full local project gates from Task 2
- GitHub Actions hosted Intel macOS job
- downloaded artifact SHA-256 comparison
- final docs validation, diff check, and branch status

## Outcomes & Retrospective

Hosted run [29187106602](https://github.com/jiabai/FrameQ/actions/runs/29187106602) completed on
`macos-15-intel` with all 18 steps successful. Its complete x86_64 Cargo run passed 103/103 and
explicitly executed the supported-task deletion, dangling-cache-symlink, linked tasks-root,
linked playback-root, and Unix parent/child process-group fixtures. The packaged executable was
reported as `Mach-O 64-bit executable x86_64`; bundled Python/worker imports, Deno, and deep
ad-hoc code-sign verification passed before DMG creation.

Artifact `frameq-macos-intel-2-eb5ed4122c0c` (ID `8258582095`) contains the DMG and its checksum,
is retained through 2026-07-19, and has a GitHub artifact-zip size of 500,196,656 bytes. The
downloaded `FrameQ_0.2.15_x64.dmg` is 509,419,917 bytes and matches SHA-256
`780ed6e62a52b993b928b243febbac945329497964fca95b0ddc692118b5bc79`. This proves native Intel
macOS tests and internal packaging for the tested commit; it does not prove Developer ID signing,
notarization, Gatekeeper first-launch behavior, or production release readiness.
