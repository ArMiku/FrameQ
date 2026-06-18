# Insight Prompt Tuning Plan

## Goal

Align FrameQ's embedded InsightFlow topic generation behavior with the local reference service where it affects output quality, without reintroducing a runtime dependency on `D:\Github\InsightFlow\src\server`.

## Findings

- FrameQ already used the same core role and JSON-output prompt shape as the reference service.
- The reference service had additional reader-facing expression constraints that FrameQ lacked, including clearer angle-of-thinking and one-line readability guidance.
- FrameQ requested questions more aggressively with a 500-character formula and a hard cap, while the reference service uses a 1000-character generation length.
- FrameQ forced `temperature=0.2`; the requested tuning changes the default to `0.7`.

## Changes

- Updated `worker/frameq_worker/insightflow/prompt.py` with the reference service's current reader-focused expression constraints and optional `global_prompt` / `question_prompt` sections.
- Changed `worker/frameq_worker/insightflow/generator.py` to calculate topic count as approximately one question per 1000 characters, with at least one question per chunk. A later topic-planner change keeps this as the direct-generation fallback strategy.
- Changed `worker/frameq_worker/llm.py` default OpenAI-compatible `temperature` to `0.7`.
- Added regression coverage for prompt content, optional prompt sections, topic-count calculation through generated prompts, and the LLM request payload temperature.

## Verification

- `uv run pytest worker\tests`
- `uv run ruff check worker`
- `python scripts\validate_agents_docs.py --level WARN`
