# Unix ProcessSupervisor CI Validation Implementation Plan

> **For agentic workers:** Execute inline with TDD. Do not commit or push until the user explicitly confirms. Keep this plan active until both GitHub-hosted Unix jobs are green and their run URL is recorded.

**Goal:** Obtain reproducible Ubuntu and macOS evidence that the real `cfg(unix)` ProcessSupervisor parent/child process-group TERM-to-KILL fixture passes.

**Architecture:** Add one isolated GitHub Actions workflow with a two-OS matrix and read-only permissions. It checks out the repository, installs stable Rust plus only Ubuntu's Tauri compilation libraries, and runs the complete Tauri Cargo test command. A Node contract test statically locks the OS matrix, command, least-privilege/no-secret boundary, and continued presence of the Unix fixture.

**Tech Stack:** GitHub Actions YAML, Rust/Cargo, Node `node:test`, Tauri v2 system dependencies.

---

## Progress

- [x] 2026-07-11: Confirmed clean `8c968bf`, read governance/architecture/security/debt, inspected existing workflows and the `cfg(unix)` fixture, and archived the two already-completed ExecPlans.
- [x] 2026-07-11: Selected an isolated Ubuntu/macOS validation workflow; no installer, signing, release, provider, LLM, media download, or payment steps are in scope.
- [x] 2026-07-11: Added the workflow contract test first and observed the expected red result: 1 pass, 1 failure because `.github/workflows/unix-process-supervisor.yml` did not exist.
- [x] 2026-07-11: Added the minimal read-only workflow and observed the focused contract test green: 2/2 passed. No Rust or ProcessSupervisor source changed.
- [x] 2026-07-11: Ran the existing Windows Cargo suite and all local project gates: Rust 90, app 205, worker 249, server 57, scripts 9, builds, Ruff, Rustfmt, docs, and focused workflow checks passed. The Unix fixture remained correctly unexecuted on Windows.
- [ ] After user authorization, commit/push the workflow, dispatch or observe the GitHub run, and record both green job URLs/IDs.
- [ ] Only after both hosted jobs pass, close the Unix cancellation verification debt and archive this plan.

## Task 1: Workflow contract TDD

**Files:**

- Create: `scripts/tests/unix-process-supervisor-workflow.test.mjs`
- Create after red: `.github/workflows/unix-process-supervisor.yml`

- [x] Write a Node test that requires exactly `ubuntu-latest` and `macos-latest`, `contents: read`, `workflow_dispatch`, the full Cargo test command, bounded timeout, Ubuntu-only system dependency installation, and no secrets/release/installer/provider commands.
- [x] Assert the Rust source still contains the `#[cfg(unix)]` parent-plus-child fixture named `unix_termination_stops_a_parent_and_child_in_the_managed_process_group`.
- [x] Run `node --test scripts/tests/unix-process-supervisor-workflow.test.mjs`; observed red result was the missing workflow file while the existing fixture assertion passed.
- [x] Add the minimal workflow without changing Rust or ProcessSupervisor behavior.
- [x] Re-run the focused Node test; observed 2/2 green.

## Task 2: Local regression gates

**Files:** no functional source changes.

- [x] Run `cargo test --manifest-path app/src-tauri/Cargo.toml` on Windows and confirm all 90 existing tests pass; the `cfg(unix)` fixture was skipped locally by platform configuration.
- [x] Run app, worker, server, script, build, lint/format, and docs gates from AGENTS/WORKFLOW. Final diff/status checks are repeated immediately before handoff.
- [x] Confirm `WECHAT_PAY_ENABLED` remains opt-in only (`=== "1"`, example value `0`) and the workflow contains no payment credentials or real external-service calls.

## Task 3: Hosted evidence gate

**Files:** update this plan and `docs/exec-plans/tech-debt-tracker.md` only after hosted success.

- [ ] Wait for explicit user authorization before any commit or push.
- [ ] Once the workflow exists on GitHub, run it against the authorized ref and inspect both job logs for the Unix fixture execution and successful full Cargo result.
- [ ] Record workflow run URL, run ID, commit SHA, Ubuntu job result, and macOS job result.
- [ ] Close the Unix verification technical debt only when both jobs are green; otherwise keep it open with the failure evidence and remediation status.

## Decisions

- Decision: Use a dedicated workflow instead of adding jobs to `desktop-release.yml`. Rationale: validation needs no release permissions, secrets, installer resources, signing, packaging, or provider smoke. Date: 2026-07-11.
- Decision: Run the complete Cargo test command rather than a name filter. Rationale: this proves the Unix fixture executes in the same suite while catching platform compilation or cancellation regressions around it. Date: 2026-07-11.
- Decision: Keep `contents: read` and avoid caches initially. Rationale: the workflow is small, auditable, and has no reason to write repository or release state. Date: 2026-07-11.
- Decision: Do not close debt based on YAML review or Windows tests. Rationale: acceptance requires real Ubuntu and macOS hosted execution. Date: 2026-07-11.

## Validation

- `node --test scripts/tests/unix-process-supervisor-workflow.test.mjs`
- `cargo test --manifest-path app/src-tauri/Cargo.toml`
- `npm --prefix app test`
- `npm --prefix app run build`
- `uv run pytest worker/tests`
- `uv run ruff check worker`
- `npm --prefix server test`
- `npm --prefix server run build`
- `node --test scripts/tests/*.test.mjs`
- `python scripts/validate_agents_docs.py --level WARN`
- `cargo fmt --manifest-path app/src-tauri/Cargo.toml -- --check`
- `git diff --check`
- `git status --short`
- GitHub Actions: Ubuntu job green and macOS job green, with run URL recorded after authorized push.

### Local validation record (2026-07-11)

- `node --test scripts/tests/unix-process-supervisor-workflow.test.mjs`: red before workflow (1 passed, 1 expected missing-file failure), then 2/2 passed after the minimal workflow.
- `cargo test --manifest-path app/src-tauri/Cargo.toml`: 90/90 passed on Windows; the `cfg(unix)` fixture was not executed locally.
- `npm --prefix app test`: 205/205 passed.
- `npm --prefix app run build`: passed.
- `uv run pytest worker/tests`: 249/249 passed with one existing dependency deprecation warning.
- `uv run ruff check worker`: passed.
- `npm --prefix server test`: 57/57 passed with Node's existing experimental SQLite warning.
- `npm --prefix server run build`: passed.
- `node --test scripts/tests/*.test.mjs`: 9/9 passed.
- `python scripts/validate_agents_docs.py --level WARN`: 0 errors, 0 warnings.
- `cargo fmt --manifest-path app/src-tauri/Cargo.toml -- --check`: passed.
- GitHub-hosted Ubuntu/macOS run: pending explicit authorization to commit/push; no run evidence exists yet.

## Residual Risk

- Until the workflow is committed/pushed and both hosted jobs are green, Unix TERM-to-KILL behavior remains unverified release debt. Local Windows and static workflow tests do not satisfy that gate.
- GitHub-hosted runner image changes may later break system dependency installation or expose an OS-specific race; the workflow should remain a required release-readiness signal after initial evidence.
