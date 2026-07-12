# GitHub Actions Node.js 24 Runtime Upgrade Plan

> This ExecPlan is a living document. The sections Progress, Surprises & Discoveries, Decision
> Log, and Outcomes & Retrospective must be kept up to date as work proceeds.

## Purpose / Big Picture

Remove the hosted-runner warning caused by JavaScript actions that still target Node.js 20. The
change updates only reusable GitHub Action versions and their contract tests. It does not alter the
FrameQ application, packaged Node.js choice, release artifacts, payment, LLM, worker, or user data
flows, and it must not create or modify a GitHub Release.

## Progress

- [x] 2026-07-12: Confirmed the warning sources and reviewed official Node.js 24-capable versions.
  Validation: repository scan found checkout v4, setup-node v4, and setup-uv v6 in three workflows;
  official action metadata confirms checkout v5, setup-node v5, and setup-uv v8 use Node.js 24.
- [ ] 2026-07-12: Update workflow contract tests first and record RED against the old actions.
  Validation: focused Node tests fail only on old action versions or missing desktop-release guard.
- [ ] 2026-07-12: Apply the minimal action upgrades and record GREEN. Validation: focused and full
  script suites pass and no old action references remain in active workflows.
- [ ] 2026-07-12: Push the isolated branch and obtain real hosted macOS ProcessSupervisor and Intel
  acceptance green runs with no Node.js 20 action-runtime annotation. Validation: run/job evidence.
- [ ] 2026-07-12: Integrate to main, close the technical debt, archive this plan, and run final
  governance/diff checks. Validation: local/remote main match and original uncommitted work remains
  untouched.

## Surprises & Discoveries

- Evidence: the Node.js warning concerns the action implementation runtime, not FrameQ's frontend
  or bundled runtime. Changing only `node-version` would not remove it.
- Evidence: `desktop-release.yml` contains three copies of each affected action, while
  `macos-intel-acceptance.yml` contains all three and `unix-process-supervisor.yml` contains only
  checkout.

## Decision Log

- Decision: Use `actions/checkout@v5`, `actions/setup-node@v5`, and
  `astral-sh/setup-uv@v8`. Rationale: these are the smallest Node.js 24-capable major upgrades from
  the current versions; checkout/setup-node v5 avoid unrelated newer-major behavior while setup-uv
  v8 explicitly declares `using: node24`. Date/Author: 2026-07-12 / User + Codex.
- Decision: Do not trigger Desktop Release. Rationale: contract tests can protect its YAML shape,
  and real Node.js 24 execution is safely proven by the non-release ProcessSupervisor and Intel
  acceptance workflows without creating assets or release state. Date/Author: 2026-07-12 / Codex.

## Outcomes & Retrospective

Implementation has not started. This section will record RED/GREEN evidence, hosted workflow run
IDs, annotation results, final commit, and remaining risks after they exist.

Residual risk: major action tags are mutable upstream references, matching the repository's current
dependency policy. Commit-SHA pinning remains a separate supply-chain hardening decision.

## Context and Orientation

- Workflows: `.github/workflows/desktop-release.yml`,
  `.github/workflows/macos-intel-acceptance.yml`, and
  `.github/workflows/unix-process-supervisor.yml`.
- Tests: `scripts/tests/macos-intel-acceptance-workflow.test.mjs`,
  `scripts/tests/unix-process-supervisor-workflow.test.mjs`, and new
  `scripts/tests/desktop-release-workflow.test.mjs`.
- Governance: `docs/exec-plans/tech-debt-tracker.md`, `TASKS.md`, `AGENTS.md`, and ExecPlan indexes.

## Plan of Work

1. Add/modify focused workflow tests to require checkout v5, setup-node v5, and setup-uv v8 and to
   reject their Node.js 20-era versions.
2. Run the focused tests and confirm RED against the current YAML.
3. Update only the `uses:` action references in the three workflows.
4. Run focused tests, all script tests, documentation validation, and `git diff --check`.
5. Push the branch and manually dispatch the macOS ProcessSupervisor and Intel acceptance
   workflows against the branch; inspect conclusions and annotations.
6. Close the tracked debt only after both hosted workflows are green without the Node.js 20 action
   warning, then integrate to main and archive the plan.

## Validation and Acceptance

```powershell
node --test scripts\tests\desktop-release-workflow.test.mjs scripts\tests\macos-intel-acceptance-workflow.test.mjs scripts\tests\unix-process-supervisor-workflow.test.mjs
node --test scripts\tests\*.test.mjs
python scripts\validate_agents_docs.py --level WARN
git diff --check
git status --short
```

Hosted acceptance:

- `macOS ProcessSupervisor` succeeds against this branch and contains no Node.js 20 deprecation
  annotation.
- `macOS Intel Acceptance Artifact` succeeds against this branch and contains no Node.js 20
  deprecation annotation.
- No Desktop Release run, tag, release asset, payment, LLM, or platform download is created.
