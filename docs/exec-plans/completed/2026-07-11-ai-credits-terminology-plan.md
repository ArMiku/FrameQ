# AI Credits Terminology ExecPlan

> Archived on 2026-07-11 after the documented frontend and documentation gates passed.

## Goal

Replace user-facing LLM quota "times" with an AI Credits balance. A Credit represents one
actual supplier LLM API-call attempt, so a confirmed summary or inspiration generation may
consume multiple Credits. This is a terminology and disclosure correction only; it does not
change server accounting, API field names, entitlement values, checkout, or worker behavior.

## Progress

- [x] 2026-07-11: Reviewed the desktop account summary, account sheet, AI target cards,
  inspiration confirmation, existing quota copy, and the server-managed quota product spec.
  Confirmed that the current account value is per-call accounting rather than a count of
  user-visible generation actions.
- [x] Added RED tests for shared AI Credits wording, AI target-card rendering, account source
  copy, and the quota-exhaustion browser smoke. Evidence: the focused run failed in all three
  visible surfaces because they still rendered `次` / `次数`; the new helper test failed because
  `aiCreditsCopy` did not exist.
- [x] Replaced public count wording with shared AI Credits copy; retained internal `llmQuota*`
  names and existing numeric/accounting behavior. AI target cards now show a Credits balance and
  the variable-cost hint; account/confirmation views show Credits balances and the full per-call
  disclosure.
- [x] Ran focused and complete frontend tests, production build, documentation validation, and
  diff checks. Results: focused app tests 4 files / 18 tests passed; complete app tests 35 files /
  236 tests passed; `npm --prefix app run build` passed; documentation validation reported 0
  errors and 0 warnings; `git diff --check` passed with only Git LF/CRLF conversion notices.

## Decision Log

- Decision: Use `AI Credits` as the public balance unit. Rationale: users must not infer that
  one remaining numeric unit equals one complete AI generation. Date/Author: 2026-07-11 /
  User + Codex.
- Decision: State that one AI Credit is one actual cloud LLM API-call attempt and that one
  confirmed AI generation may consume multiple Credits. Rationale: this is the existing
  billing rule and makes the variable cost explicit without promising a fixed action price.
  Date/Author: 2026-07-11 / User + Codex.
- Decision: Keep API, storage, TypeScript account fields, and server quota logic unchanged.
  Rationale: the correction is public terminology and disclosure, not a billing migration.
  Date/Author: 2026-07-11 / User + Codex.

## Implementation Plan

1. Write failing Vitest assertions for shared Credits wording and AI target-card output; verify
   the current implementation still says `次` / `次数`.
2. Extract minimal shared presentation helpers for balance, allocation, short variable-cost
   hint, and full confirmation disclosure. Move the existing confirmation-only helper to this
   shared boundary.
3. Apply the helpers to AI target cards, account summary, inspiration confirmation, account
   sheet, and quota-exhausted copy. Do not touch `llmQuota*` data or server code.
4. Update tests and product specs, then run frontend and documentation gates.

## Validation

- `npm --prefix app test -- insightPreferenceFlow.test.ts TaskWorkspaces.test.tsx`
- `npm --prefix app test`
- `npm --prefix app run build`
- `python scripts/validate_agents_docs.py --level WARN`
- `git diff --check`

## Residual Risk

The exact Credits cost remains variable because it follows actual supplier API-call attempts.
The UI must disclose that variability rather than estimate a fixed Credits price for a generation
before the supplier calls are known.

## Outcome

Every user-visible AI balance now uses `AI Credits`, not an available-generation count. The
confirmation disclosure states that one AI Credit corresponds to one actual cloud LLM API-call
attempt and that one AI整理 may consume multiple Credits. No API, database, entitlement,
checkout, worker, or server accounting behavior changed.
