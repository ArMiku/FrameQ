# Administrator Quota Audit Migration ExecPlan

> This ExecPlan is a living document. The sections Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective must be kept up to date as work proceeds.

## Purpose / Big Picture

Administrators can now inspect quota as read-only data and grant additional quota only through the existing compensation form, where a reason and immutable audit record are required. There is no user-visible payment change: WeChat Pay remains disabled, unintegrated, and unavailable to ordinary users.

## Progress

- [x] 2026-07-10: Traced all production and test callers of `POST /admin/api/users/:userId/llm-quota`, its Admin Web handler, and `updateEntitlementQuota`. Validation: repository search found one production route/UI path and no other production Store caller.
- [x] 2026-07-10: Updated product specs and created this execution plan before implementation. Validation: policy now requires additive audit-backed quota grants and rejects reset/reduction without a separately specified operation.
- [x] 2026-07-10: Added failing route/UI tests that expected the direct route to be absent and the HTML to contain no direct editor. Validation: focused run failed because the route returned 200 and the page contained `/llm-quota`.
- [x] 2026-07-10: Removed the direct route, validation schema, UI control/handler, and unused Store methods; preserved the existing atomic adjustment path. Validation: focused `llmQuota`, `admin`, and `routes` tests passed 20/20.
- [x] 2026-07-10: Expanded disabled-payment coverage to native order, order status, and webhook routes without provider calls. Validation: all return `WECHAT_PAY_DISABLED` with `wechatPayEnabled: false`.
- [x] 2026-07-10: Ran server, worker, app, and Rust automated gates. Validation: results are recorded below.

## Surprises & Discoveries

- Evidence: `server/src/server.ts` used a read-then-write remaining-quota route even though `server/src/entitlementAdjustment.ts` and `applyEntitlementAdjustmentWithAudit` already provided the required atomic audit boundary.
- Evidence: `server/src/adminPage.ts` already had an additive `quota_add` plus reason form, so removing the parallel input required no new backend API or operation type.
- Evidence: `server/src/server.ts` defaults `wechatPayEnabled` to `process.env.WECHAT_PAY_ENABLED === "1"`; the three payment entry points return 404 before authentication or provider parsing while disabled.

## Decision Log

- Decision: Remove rather than translate the remaining-quota route to a calculated quota delta. Rationale: a calculated negative delta would reintroduce an unspecified reduction/reset policy and could alter an administrator's intended support record. Date/Author: 2026-07-10 / User + Codex.
- Decision: Keep quota display read-only and use the existing adjustment form for positive `quota_add` grants. Rationale: it preserves `llmQuotaUsed`, requires a reason, and creates the entitlement change and audit record atomically. Date/Author: 2026-07-10 / User + Codex.
- Decision: Do not enable or integrate WeChat Pay. Rationale: no provider credentials, live callback verification, or end-to-end approval are available; local tests prove only internal business logic. Date/Author: 2026-07-10 / User + Codex.

## Outcomes & Retrospective

The unaudited administrator quota-write path has been removed. All supported administrator quota grants now use `applyEntitlementAdjustmentWithAudit`, preserving used quota and committing the audit record with the entitlement mutation. The direct route is a 404, and Admin UI no longer renders its editor or fetch call.

Residual risk: historical direct quota edits have no retroactive audit record and are not inferred or rewritten. WeChat billing code remains a disabled future integration; simulated billing tests do not establish payment-provider availability, callback verification, or release readiness.

## Context and Orientation

- Product: `docs/product-specs/2026-06-22-server-managed-llm-quota.md`, `docs/product-specs/2026-06-27-admin-entitlement-adjustments.md`, and `docs/product-specs/2026-07-10-server-entitlement-transaction-safety.md`.
- Server: `server/src/server.ts`, `server/src/entitlementAdjustment.ts`, `server/src/store.ts`, `server/src/prismaStore.ts`, and `server/src/adminPage.ts`.
- Tests: `server/tests/llmQuota.test.ts`, `server/tests/admin.test.ts`, `server/tests/routes.test.ts`, and transaction-safety tests.
- Governance: `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/exec-plans/tech-debt-tracker.md`, and `TASKS.md`.

## Plan of Work

1. Identify direct quota mutation route, UI request, Store method, tests, and the safe payment-off behavior.
2. Specify additive-only audited quota grants and disabled/unintegrated payment status.
3. Add red tests for removal of the direct path and local disabled-payment coverage.
4. Remove the direct path and retain the existing audited transaction boundary.
5. Run focused and repository gates, then archive this plan.

## Validation and Acceptance

- `npm --prefix server test` — 12 files, 57 tests passed.
- `npm --prefix server run build` — passed.
- `uv run pytest worker\tests` — 244 passed; one existing Python 3.13 `audioop` deprecation warning.
- `uv run ruff check worker` — passed.
- `npm --prefix app test` — 28 files, 187 tests passed.
- `npm --prefix app run build` — passed.
- `cargo test --manifest-path app\src-tauri\Cargo.toml` — 83 tests passed.
- `python scripts\validate_agents_docs.py --level WARN` — 0 errors, 0 warnings.
- `git diff --check` — passed.
- Final `git status --short` is recorded at archival handoff with no temporary planning files.
