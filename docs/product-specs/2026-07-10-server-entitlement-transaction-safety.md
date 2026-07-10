# Server Entitlement Transaction Safety

## Background

FrameQ currently uses administrator-issued activation codes as the visible monthly-pass unlock path. WeChat payment code remains disabled for ordinary users, but it retains the same entitlement grant responsibility when the channel is enabled. Manual administrator compensation also changes paid-access state and must always have an append-only audit record.

The three operations previously performed their related writes independently. A process or database failure could leave a recorded webhook without a paid order, a redeemed activation code without entitlement, or changed entitlement without a compensation audit.

## Requirements

- Payment settlement is one retry-safe operation: deduplicate the provider event, validate the target order, mark it paid, extend entitlement from the later of payment time or current expiry, and return final entitlement.
- Replaying the same verified webhook must not grant another pass. Distinct events for the same order may be recorded but may settle it only once. A mismatched order, state, transaction identifier, or event/order binding must return an explicit error without overwriting existing records.
- Activation redemption is one operation: validate desktop session, code status and deadline; atomically mark the code redeemed; update entitlement expiry and LLM quota; then return final entitlement. Concurrent redemption permits at most one success.
- Administrator compensation is one operation: derive expiry/quota from the current entitlement, persist the entitlement change and a complete append-only audit record, and return both. Every administrator quota change must use this operation; a missing audit must roll back the entitlement change.
- Public route response fields and successful HTTP behavior remain unchanged. Routes retain authentication, CSRF, request parsing, and HTTP mapping; services/use-cases own business invocation; Store owns database consistency.
- WeChat Pay is not an enabled or integrated release capability. `WECHAT_PAY_ENABLED` remains closed by default, no ordinary-user purchase entry is available, and local billing tests cover only internal settlement logic rather than provider credentials, real callback verification, or end-to-end payment readiness.

## Recovery and Legacy Data

- A verified webhook replay may repair only a deterministic historical payment state: the same provider event and order binding, an event payload containing the same transaction ID, and an order that is still pending or paid without its entitlement. Recovery remains idempotent and grants no second pass. A legacy webhook without that transaction binding is ambiguous and must not trigger an automatic grant.
- Do not automatically repair a redeemed activation code with missing/uncertain entitlement, or an entitlement with no matching administrator audit. Subsequent activation, compensation, expiry, or manual database work can make the intended state unknowable.
- Administrators must first detect these ambiguous records using the documented bounded checks, then use the existing administrator compensation endpoint with reason `manual_repair`. That creates the required audit record. The process must not log activation-code plaintext, session tokens, free-form support notes, or payment payload secrets.

### Operator Checks and Repair

- Payment: do not synthesize a webhook or edit an order manually. Request/replay the provider's signature-verified notification for the affected event. The settlement operation will recover only the matching pending or paid-without-entitlement state, once.
- Activation: a read-only check may list only activation-code prefix, code record ID, redeemed user ID, and redeemed time for `redeemed` codes whose `redeemedByUserId` has no `Entitlement` record. It must not display `codeHash` or attempt to infer a grant when an entitlement exists. A confirmed incident is repaired through the administrator adjustment endpoint with `reason=manual_repair` and an incident reference that contains no secret.
- Administrator compensation: no reliable database-only query can distinguish an unaudited historic compensation from a later activation, payment, or repair that touched the same entitlement. Support must correlate a specific incident with its known before/after evidence, then create a new `manual_repair` adjustment; it must not insert a backdated audit row or mutate an old audit record.

## Acceptance Criteria

- Real Prisma/SQLite transaction tests prove rollback after injected event/order/entitlement/audit failures, and retries safely complete once.
- MemoryStore exposes the same all-or-nothing, replay, and concurrency semantics as PrismaStore.
- Tests cover duplicate and concurrent webhooks, duplicate and concurrent activation redemption, transaction/event mismatches, and the existing successful response contracts.
- Architecture and security documentation describe the new transaction boundary and bounded recovery policy.
