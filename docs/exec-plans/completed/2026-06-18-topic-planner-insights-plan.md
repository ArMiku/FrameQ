# Topic Planner Insights Plan

## Goal

Improve topic point quality for ASR transcripts that arrive as one large unstructured text block by letting the LLM first plan semantic topic segments, then generating questions per planned topic.

## Design

- The worker asks the configured InsightFlow LLM for a topic plan over the full transcript markdown before generating questions.
- The planner prompt asks for strict JSON with `id`, `title`, `summary`, `excerpt`, and `question_count`.
- Valid topic plans are normalized to at most 8 topics, with each topic limited to 1-3 questions and the final insight list capped at 12.
- The second pass uses the existing reader-focused question prompt against each topic's title, summary, and excerpt.
- If the planner output cannot be parsed or contains no valid topics, the worker falls back to the previous direct chunk-based generation path.
- The fallback path still uses the 1000-character question-count heuristic introduced in the prompt-tuning change.

## Verification

- Added tests for planner prompt structure, two-pass planner + question generation, planner failure fallback, fallback question count, and final question-count cap.
- Validation commands:
  - `uv run pytest worker\tests`
  - `uv run ruff check worker`
  - `python scripts\validate_agents_docs.py --level WARN`
