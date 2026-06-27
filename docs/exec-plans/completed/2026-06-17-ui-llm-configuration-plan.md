# Retired Local UI LLM Configuration Plan

This completed plan is retained only as historical context. It is not a current product or implementation guideline.

## Current Meaning

FrameQ no longer lets the desktop UI or desktop `.env` manage insight-topic LLM configuration.

Current rules:

- LLM base URL, API key, model, timeout, and related cloud configuration are managed in FrameQ server Admin Web.
- Desktop `.env` is only for non-LLM local settings such as output directory, ASR model selection, and model download overrides.
- The desktop worker ignores legacy local `FRAMEQ_LLM_*` dotenv keys.
- Insight generation receives temporary runtime material only through server-managed checkout for that invocation.

## Historical Scope

The original 2026-06-17 work briefly added desktop controls for local LLM configuration. That path was superseded by:

- `docs/product-specs/2026-06-22-server-managed-llm-quota.md`
- `docs/exec-plans/completed/2026-06-22-server-managed-llm-quota-plan.md`
- `docs/exec-plans/completed/2026-06-23-disable-root-dotenv-llm-plan.md`

Do not use this retired plan to add or restore desktop LLM fields.
