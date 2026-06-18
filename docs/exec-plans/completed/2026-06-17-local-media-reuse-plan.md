# Local Media Reuse Plan

## Goal

Keep using yt-dlp for repeat URL handling, but make FrameQ deterministic after the command returns: choose the media file by the URL video ID and skip ffmpeg audio extraction when the existing WAV is already valid.

## Context

- Current worker flow always calls `yt-dlp`, then selects the newest video in the output directory.
- This can reuse yt-dlp's own existing-file fast path, but selecting by newest file can attach the wrong video when the output directory contains multiple tasks.
- Existing audio in `work/` is always overwritten by ffmpeg, even when the same URL already produced a valid WAV.

## Implementation

- [x] Add media helpers for extracting a Douyin video ID from URL text and validating audio-only media.
- [x] Add worker tests showing `yt-dlp` is still called, output selection prefers the URL ID, and valid existing WAV files skip `ffmpeg`.
- [x] Update `run_worker_pipeline` to prefer URL-ID-matched video files after `yt-dlp` returns, falling back to newest video only when no ID-specific file exists.
- [x] Update audio extraction to reuse `work/<video_stem>.wav` when `ffprobe` confirms a valid audio stream.
- [x] Run worker tests, ruff, and the docs validation gate.

## Validation

- `uv run pytest worker\tests`: 55 passed.
- `uv run ruff check worker`: passed.
- `python scripts/validate_agents_docs.py --level WARN`: 0 errors, 0 warnings.
