# Server Entitlement Transaction Safety ExecPlan

## Goal

Make payment settlement, activation-code redemption, and administrator entitlement compensation each a single atomic, safely retryable Store operation without changing successful public API responses.

## Architecture and Boundaries

- `Store` defines semantic domain operations. `PrismaStore` owns interactive Prisma callbacks; `MemoryStore` mirrors all-or-nothing behavior for unit tests.
- `BillingService`, `ActivationCodeService`, and a focused entitlement-adjustment use case invoke Store operations and map typed outcomes to existing public errors. Fastify routes remain limited to auth, CSRF, request parsing, and HTTP mapping.
- No compensating write sequence is permitted. The payment recovery exception is a verified replay of the exact event/order/transaction identity; ambiguous activation and adjustment history is detected and repaired manually with an audited adjustment.

## Progress

- [x] 2026-07-10: Read governance, architecture, security, product specs, active/completed plans, debt tracker, Store, PrismaStore, services, routes, schema, and tests; confirmed three non-atomic write sequences.
- [x] 2026-07-10: Approved semantic Store transaction and bounded legacy-recovery design.
- [x] Add failure-first real SQLite/Prisma and MemoryStore regression tests. Evidence: initial focused red run failed 10/11 assertions for the expected sequential-write defects; adversarial review added bounded-recovery, strict legacy transaction-binding, event-recording parity, exact-event concurrency, and temporary-fixture cleanup regressions; final focused suite passes 21 tests.
- [x] Add semantic Store methods and minimal service/route delegation.
- [x] Verify legacy recovery/detection documentation and all release gates.

## Decisions

- Use Prisma known request error code `P2002` for webhook uniqueness; never inspect an exception string.
- Preserve the existing `WebhookEvent`, `Order.transactionId`, activation status, entitlement, and audit schema; no data-model migration is required for the new transaction boundary.
- Do not auto-grant for ambiguous historical activation/admin states. Record their bounded detection and `manual_repair` process as release risk rather than guessing.
- The real Prisma test fixture creates a temporary SQLite database by generating DDL with `prisma migrate diff --from-empty --script` and applying it with Node's local SQLite API. On this host, `prisma db push` schema-engine startup failed without diagnostics; the fixture never targets a developer database.

## Outcomes

- Payment settlement, activation redemption, and administrator compensation now use `settlePaidOrder`, `redeemActivationCodeAndGrantEntitlement`, and `applyEntitlementAdjustmentWithAudit` respectively.
- PrismaStore performs all reads and writes for each operation in one private interactive transaction. MemoryStore serializes the same operations and restores a full in-memory snapshot if any write throws.
- Verified payment replay can complete a deterministic old pending/payment-without-entitlement state once only when its stored event proves the same transaction ID. Ambiguous historical payment, activation, and admin states have an operator-only `manual_repair` path and no automatic grant.

## Validation Results

- `npm --prefix server test` — 12 files, 57 tests passed.
- `npm --prefix server run build` — passed.
- `uv run pytest worker\tests` — 244 passed; one pre-existing Python 3.13 `audioop` deprecation warning.
- `uv run ruff check worker` — passed.
- `npm --prefix app test` — 28 files, 187 tests passed.
- `npm --prefix app run build` — passed.
- `cargo test --manifest-path app\src-tauri\Cargo.toml` — 83 tests passed.
- `python scripts\validate_agents_docs.py --level WARN` — 0 errors, 0 warnings.
- Final `git diff --check` and `git status --short` are recorded at task handoff.
