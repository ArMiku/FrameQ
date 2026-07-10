# React UI Smoke Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan inline with TDD. Do not commit or push until the user explicitly confirms.

**Goal:** Add deterministic browser-level React smoke coverage for settings, history/task ownership, transcript editing, and target-scoped AI confirmation without starting real Tauri services or external product integrations.

**Architecture:** Extend the existing Vite + CDP browser test process instead of adding an E2E framework. A test-only mock Tauri bridge will expose scenario data, deferred command completion, and an invocation ledger; tests interact through rendered DOM controls and wait on observable DOM/ledger predicates. Production controllers remain unchanged unless a failing smoke proves a real wiring defect.

**Tech Stack:** Vitest, React 19, Vite test server, existing Chrome DevTools Protocol harness, test-only Tauri IPC mocks.

---

## Scope and file map

- Modify `app/tests/app-input.browser.test.ts`: add sequential UI smoke cases and remove the remaining fixed-delay readiness assertion.
- Modify `app/package.json`: run Vitest files serially so the CDP smoke cannot compete with concurrent unit-test transforms.
- Create only if duplication requires it: `app/tests/support/mockTauriBridge.ts`, responsible solely for serializing deterministic test scenarios into a page-init script. It must not be imported by production code.
- Modify `docs/exec-plans/tech-debt-tracker.md`, `TASKS.md`, and ExecPlan indexes only after evidence is available.
- Do not modify payment, WeChat Pay, server entitlement, LLM credentials, worker/download platforms, release workflows, or ProcessSupervisor.

## Progress

- [x] 2026-07-11: Confirmed clean `d978f6d`, read governance/architecture/design/debt, and inspected the existing CDP browser test plus settings/history/workflow/insight controller tests.
- [x] 2026-07-11: Chose the existing single Vite/CDP process with isolated pages and a scenario-driven mock Tauri bridge; no new runtime or E2E dependency.
- [x] 2026-07-11: Added the smoke import/assertion first and observed the expected RED: the focused suite failed before collecting tests because `tests/support/mockTauriBridge` did not exist.
- [x] 2026-07-11: Implemented the test-only scenario bridge and condition helpers, then drove five real React UI paths green. No production controller or component code changed.
- [x] 2026-07-11: Closed every CDP target through the debugging endpoint, ran the focused browser test three consecutive times (16/16 each), then ran the complete app suite serially (31 files, 211/211) and the production build without concurrent heavy commands.
- [x] 2026-07-11: Ran all project gates, closed only the automated React/UI smoke debt, retained the real-Tauri/installer residual risk, and left the worktree uncommitted for confirmation.

## Task 1: Deterministic browser harness contract

**Files:** `app/tests/app-input.browser.test.ts`; optional `app/tests/support/mockTauriBridge.ts`.

- [x] Add smoke tests that request a scenario bridge before implementing it; `npm --prefix app test -- app-input.browser.test.ts` failed at the expected missing module.
- [x] Add a test-only bridge with safe fixture identifiers, canonical non-sensitive URLs, command ledger, deferred resolve/reject controls, Tauri event callbacks, and fixed responses for startup/account commands.
- [x] Add page helpers that wait for `.app-shell` plus an explicit bridge-ready marker. UI correctness uses condition polling; the page-mount predicate has a bounded 10-second budget.
- [x] Mark the lifecycle smoke describe sequential, isolate every case in a fresh CDP target, and close each page in `finally` while retaining the existing shared-process cleanup.
- [x] Replace the existing post-paste `delay(300)` with an input-value and enabled-submit condition.

## Task 2: Settings lifecycle smoke

**Files:** `app/tests/app-input.browser.test.ts` and the test-only bridge helper.

- [x] Open settings from the rendered toolbar while `get_llm_config` is deferred; assert the sheet and loading copy/state are observable.
- [x] Resolve config, cache usage, and preference reads; assert the storage category exposes the cache cleanup entry and clearing invokes only `clear_audio_review_cache` before rendering `0 B`.
- [x] Reopen in an isolated page with a controlled config-read rejection; assert loading ends and the rendered failure notice is actionable.
- [x] Assert the invocation ledger contains no worker, payment, LLM checkout, download, or external-provider command; startup/account calls are handled entirely by the in-page mock.

## Task 3: History ownership and transcript stale callback smoke

**Files:** `app/tests/app-input.browser.test.ts` and the test-only bridge helper.

- [x] With a deferred `process_video`, open history and assert entries are rendered read-only/disabled and current processing UI remains unchanged.
- [x] Repeat the selection assertion while deferred `retry_insights` is active and while the worker remains pending in `cancelling`; resolve each worker operation and assert its real terminal state remains visible.
- [x] From a stable terminal state, select a completed history item and assert task identity/text are restored through rendered result/detail UI and the `load_transcript_detail` command targets that task.
- [x] Open the restored transcript, edit it, start a deferred `save_transcript_edit`, restore a different stable history task, then resolve the old save. Assert the second task's text/count and subsequent detail load remain current without exposing a workflow setter.

## Task 4: Target-scoped AI confirmation smoke

**Files:** `app/tests/app-input.browser.test.ts` and the test-only bridge helper.

- [x] Restore a completed transcript fixture with authenticated `can_generate_ai` account state.
- [x] Open the pending summary card and assert the rendered `确认要点总结` dialog; confirm and assert exactly one mocked `retry_insights` invocation with target `summary` and no preference snapshot.
- [x] Open the pending inspiration card, load a safe existing profile/default preference fixture, enter `确认启发灵感`, confirm, and assert exactly one mocked `retry_insights` invocation with target `insights` and the structured preference snapshot.
- [x] Assert no real LLM/provider/network/quota command occurs; the test verifies request routing only and does not claim supplier or quota integration.

## Decisions

- Decision: Reuse the current CDP harness rather than add Playwright/Cypress or a DOM emulation dependency. Rationale: the current harness already renders the real React tree and injects Tauri IPC safely; adding a framework would be disproportionate. Date: 2026-07-11.
- Decision: Keep all mock controls behind Tauri command responses and DOM interactions. Rationale: exposing controller setters would weaken the task-identity boundary and test an artificial API. Date: 2026-07-11.
- Decision: Use condition polling, deferred promises, command ledgers, and isolated pages. Rationale: readiness must be observable and browser tests must not depend on arbitrary sleeps or cross-test state. Date: 2026-07-11.
- Decision: Disable Vitest file parallelism for the app suite. Rationale: a full-suite RED proved that browser page mounting could compete with 30 concurrently transformed unit-test files; serial execution is the smallest deterministic policy and keeps browser/build work non-concurrent. Date: 2026-07-11.
- Decision: No product spec update. Rationale: this task verifies existing user behavior and adds test infrastructure without changing product semantics. Date: 2026-07-11.

## Validation

- Focused RED/GREEN: `npm --prefix app test -- app-input.browser.test.ts`
- `npm --prefix app test`
- `npm --prefix app run build`
- `cargo test --manifest-path app/src-tauri/Cargo.toml`
- `uv run pytest worker/tests`
- `uv run ruff check worker`
- `npm --prefix server test`
- `npm --prefix server run build`
- `node --test scripts/tests/*.test.mjs`
- `python scripts/validate_agents_docs.py --level WARN`
- `cargo fmt --manifest-path app/src-tauri/Cargo.toml -- --check`
- `git diff --check`
- `git status --short`

### Validation record (2026-07-11)

- Focused TDD RED: missing `tests/support/mockTauriBridge` prevented test collection, as intended.
- Focused GREEN/stability: after real target cleanup, `npm --prefix app test -- app-input.browser.test.ts` passed 16/16 in three consecutive runs.
- Full-suite concurrency RED: default Vitest file parallelism caused browser readiness to compete with unit-test transforms (210/211 passed); this was not hidden by a larger timeout.
- `npm --prefix app test`: after adding `--no-file-parallelism`, 31 files and 211/211 tests passed; the final run completed in 11.36 seconds.
- `npm --prefix app run build`: passed; test support is not imported by production code.
- `cargo test --manifest-path app/src-tauri/Cargo.toml`: 90/90 passed on Windows.
- `uv run pytest worker/tests`: 249/249 passed with the existing `audioop` deprecation warning.
- `uv run ruff check worker`: passed.
- `npm --prefix server test`: 57/57 passed with Node's existing experimental SQLite warning.
- `npm --prefix server run build`: passed.
- `node --test scripts/tests/*.test.mjs`: 9/9 passed.
- `python scripts/validate_agents_docs.py --level WARN`: 0 errors, 0 warnings.
- `cargo fmt --manifest-path app/src-tauri/Cargo.toml -- --check`: passed.
- `git diff --check`: passed; only repository line-ending notices were emitted.
- `git status --short`: only the uncommitted files listed in the final handoff; no unrelated workspace changes.

## Outcome and residual risk

- The former missing automated UI smoke now has real React rendering and DOM interaction coverage for the requested settings, task-history ownership, transcript-save isolation, and AI-target wiring paths, all behind deterministic mocked Tauri IPC.
- CDP smoke renders the real React app but mocks Tauri IPC. It does not validate native WebView differences, OS dialogs, filesystem permissions, packaged resources, installer lifecycle, signing/notarization, or real worker/server/provider behavior.
- The existing harness discovers an installed Chromium-family browser. No new browser package is added; machines without the existing browser prerequisite cannot execute this smoke locally.
