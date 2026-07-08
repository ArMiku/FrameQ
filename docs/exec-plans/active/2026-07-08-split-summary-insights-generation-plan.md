# Split Summary and Inspiration Generation ExecPlan

## Goal

Let users trigger `要点总结` and `启发灵感` independently after transcript completion, without one action implicitly generating the other.

## Decisions

- Keep the existing `retry_insights` command path, but require an explicit `target`: `summary` or `insights`.
- `summary` target generates `ai/summary.md` and hidden `ai/mindmap.mmd` only.
- `insights` target generates `ai/insights.json` and `ai/insights.md` only, and is the only target allowed to persist/send `preference-snapshot.json`.
- Task manifest updates must merge existing AI artifacts from the same task directory, so generating one target does not clear the other target or reset `insights_count`.
- Both targets use server-managed LLM checkout only after user confirmation, with quota charged per actual supplier API-call attempt.

## Implementation Tasks

- Update product, architecture, design, and security docs for independent result-card confirmations.
- Add worker request parsing tests for target validation and preference-snapshot scoping.
- Split worker AI generation by target while preserving the existing internal all-output helper for non-UI legacy callers.
- Add task-manifest tests for summary-only and insights-only retries preserving existing artifacts.
- Update Tauri and frontend retry request shapes to include target.
- Add frontend tests for target-specific retry payloads, progress copy, and result-card target mapping.
- Add a lightweight summary confirmation sheet and route the inspiration card through the existing preference flow.
- Run worker, frontend, Rust, build, lint, and governance validation gates.

## Progress

- [x] Worker request and split-generation tests added.
- [x] Worker target-specific generation and artifact merge implemented.
- [x] Frontend/Tauri target payload tests added.
- [x] Frontend/Tauri target plumbing and summary confirmation UI implemented.
- [x] Product, architecture, design, security, and personalized preference docs updated.
- [x] Final validation gates.

## Validation

- `uv run pytest worker\tests`
- `uv run ruff check worker`
- `npm --prefix app test`
- `npm --prefix app run build`
- `cargo test --manifest-path app\src-tauri\Cargo.toml`
- `python scripts\validate_agents_docs.py --level WARN`
