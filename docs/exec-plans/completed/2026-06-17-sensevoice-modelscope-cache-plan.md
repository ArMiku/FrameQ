# SenseVoice ModelScope Cache Plan

## Goal

Ensure SenseVoice Small and its FunASR VAD dependency cache under FrameQ's configured model directory instead of ModelScope's user-level default cache.

## Context

- FrameQ resolves its model cache to project `models/` by default, with `FRAMEQ_MODEL_DIR` as the override.
- Qwen already receives the resolved cache path through its model loader.
- FunASR's `AutoModel` does not use FrameQ's previous `model_cache_dir` keyword to control ModelScope downloads.
- ModelScope's `snapshot_download()` falls back to `MODELSCOPE_CACHE` when no `cache_dir` is passed.

## Implementation

- [x] Add regression coverage that SenseVoice construction sets `MODELSCOPE_CACHE` to the resolved model cache directory.
- [x] Set `MODELSCOPE_CACHE` in the Python worker before constructing SenseVoice `AutoModel`.
- [x] Stop passing the ineffective `model_cache_dir` keyword to FunASR.
- [x] Document that `FRAMEQ_MODEL_DIR` controls SenseVoice/ModelScope cache placement.

## Validation

- `uv run pytest worker\tests`: 55 passed.
- `uv run ruff check worker`: passed.
- `python scripts/validate_agents_docs.py --level WARN`: 0 errors, 0 warnings.
