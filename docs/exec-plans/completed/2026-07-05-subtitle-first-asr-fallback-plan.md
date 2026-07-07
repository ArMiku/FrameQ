# Subtitle-First ASR Fallback ExecPlan

## Purpose

Use platform subtitle files from public YouTube and Bilibili `yt-dlp` success paths as a local transcript source before loading the ASR model. When usable subtitles exist, FrameQ should still preserve the normal video/audio artifacts and result cards, but skip local ASR model loading and inference. When subtitles are absent, malformed, too short, or the Bilibili public fallback path is used, the worker must silently continue through the existing ASR path.

This remains a local-first feature. It must not add cookies, login, private-content bypass, playlist workflows, stream picker UI, or a new download-center surface.

## Progress

- [x] 2026-07-05: Design reviewed and accepted in `docs/design-docs/2026-07-05-youtube-bilibili-subtitle-first-asr-fallback.md`.
- [x] Product, architecture, security, design, and task docs synchronized before runtime work.
- [x] Worker subtitle command policy, parser, transcript writer, pipeline integration, and manifest metadata implemented with tests.
- [x] Tauri, frontend worker/history/detail types, and cached manifest restore updated with tests.
- [x] Bundled worker resource copy synchronized.
- [x] Validation commands pass or residual risks are documented.

## Surprises

- 2026-07-05: Existing active plans remain in `docs/exec-plans/active/` even when most tasks are complete. This plan is additive and does not modify those plan histories.
- 2026-07-06: `pydub` emits a Python 3.13 `audioop` deprecation warning during worker tests; it is pre-existing dependency noise and does not affect this feature.
- 2026-07-06: `git diff --check` reports existing CRLF normalization warnings for modified files, but no whitespace errors.

## Decision Log

- 2026-07-05: v1 supports YouTube and Bilibili only through `yt-dlp` subtitle outputs. Bilibili public fallback does not fetch subtitles and continues to ASR.
- 2026-07-05: Subtitles are an optimization, not a new required stage. Missing, malformed, or too-short subtitle files degrade to ASR without changing existing download/media/ASR error codes.
- 2026-07-05: The worker keeps the existing video save, media validation, audio extraction, audio review, and result-card behavior even when subtitles are used. The feature skips only ASR model load and inference.
- 2026-07-05: Subtitle probing runs inside `JobStage.VIDEO_TRANSCRIBING` as a progress substep. No new worker progress enum or frontend stage is added.
- 2026-07-05: `frameq-task.json` keeps top-level `model` as the configured ASR fallback model and adds a `transcript` object for the actual transcript source.
- 2026-07-05: v1 records `transcript.source`, `transcript.language`, and `transcript.engine`; it does not claim to identify manual versus automatic versus translated subtitles.

## Plan of Work

1. Worker transcript metadata and writer
   - Add a source-aware transcript metadata shape.
   - Move or wrap transcript writing so both ASR and subtitle paths can write the same stable `transcript.txt`, `transcript.md`, and `segments.json` artifacts.
   - Preserve ASR metadata for ASR output and write `Transcript Source: Platform subtitle` metadata for subtitle output.
   - Update ASR tests so existing transcript files still match the current task-owned layout.

2. Worker subtitle parsing and selection
   - Add a focused subtitle module that scans `TaskPaths.download_dir` for `.vtt` and `.srt`.
   - Prefer languages in `zh-Hans, zh-CN, zh-Hant, en, ja, ko`.
   - Parse SRT and VTT timestamps, drop VTT control lines, remove simple tags, unescape entities, skip empty cues, and lightly deduplicate rolling captions.
   - Treat empty, invalid, too-short, or all-invalid subtitle files as unavailable.

3. Worker download command and pipeline
   - Add subtitle arguments only for YouTube and Bilibili `yt-dlp` commands, before the URL argument.
   - Do not add `--convert-subs`, cookies, login, proxy, or browser-cookie flags.
   - Detect when `download_video` returned the Bilibili public fallback path and force ASR for that run.
   - After audio extraction and before ASR model readiness/loading checks, probe subtitles inside `VIDEO_TRANSCRIBING`.
   - On subtitle success, write transcript artifacts, populate `ProcessResult.transcript`, and continue to optional AI整理 without building a transcriber.
   - Ensure `generate_insights=false`, `run_insight_generation_step`, and `result_with_task` all preserve transcript metadata.

4. Worker result contract and manifest
   - Extend `ProcessResult` and `contracts/desktop-worker-contract.json` with optional `transcript` metadata.
   - Upgrade task manifest schema to `schema_version: 2`.
   - Keep `model` for configured ASR fallback model and add `transcript: { source, language, engine }`.
   - Read schema v1 manifests as ASR-sourced transcripts using the existing `model` field.

5. Tauri and frontend integration
   - Add Rust `TranscriptMetadata` / result / manifest fields and restore metadata from cached task manifests.
   - Keep repeated URL matching against top-level `model`.
   - Add TypeScript `WorkerResult` / history item transcript metadata.
   - Show transcript source and language in the transcript detail view without adding a new result card or showing raw Mermaid/subtitle files.

6. Bundled worker resource sync
   - Copy changed worker source files into `app/src-tauri/resources/worker/...` when the corresponding source files exist there.
   - Keep packaged runtime behavior aligned with development source.

7. Validation and cleanup
   - Run focused worker tests after each TDD slice.
   - Run app and Rust tests once the contract/UI work lands.
   - Run full gates listed below and update this plan's validation log.

## Validation

- Documentation
  - `python scripts\validate_agents_docs.py --level WARN`
  - `git diff --check`
- Worker
  - Subtitle args apply to YouTube and Bilibili only, not Douyin, Xiaohongshu, or unrelated generic URLs.
  - Subtitle args include `--write-subs`, `--write-auto-subs`, `--sub-langs`, `--sub-format`, `--no-playlist`, and no cookie/login flags.
  - SRT and VTT parser tests cover cue settings, `WEBVTT`/`NOTE`, HTML/XML tags, duplicate rolling captions, empty cues, illegal timestamps, and empty-output fallback.
  - Pipeline tests cover subtitle success skipping ASR model readiness/load, no-subtitle ASR fallback, parse failure ASR fallback, Bilibili fallback ASR behavior, and `generate_insights=false` transcript metadata preservation.
  - Manifest tests cover schema v2 `transcript` metadata and schema v1 fallback reading.
  - `uv run pytest worker\tests`
  - `uv run ruff check worker`
- Tauri
  - Worker result parsing accepts optional `transcript`.
  - Task manifest parsing reads schema v2 metadata and defaults schema v1 to ASR metadata.
  - Cached repeated URL results preserve `transcript` metadata while matching by top-level `model`.
  - `cargo test --manifest-path app\src-tauri\Cargo.toml`
- Frontend
  - Worker/history client types preserve transcript metadata.
  - Transcript detail displays source and language when available.
  - No raw subtitle or Mermaid text is displayed as a card/tab.
  - `npm --prefix app test`
  - `npm --prefix app run build`

## Validation Log

- 2026-07-06: `python scripts\validate_agents_docs.py --level WARN` passed with 0 errors and 0 warnings.
- 2026-07-06: `uv run pytest worker\tests -q` passed: 134 tests passed, 1 non-blocking `pydub` deprecation warning.
- 2026-07-06: `uv run ruff check worker` passed: all checks passed.
- 2026-07-06: `npm --prefix app test` passed: 121 tests passed across 20 files.
- 2026-07-06: `npm --prefix app run build` passed: `tsc && vite build` completed successfully.
- 2026-07-06: `cargo test --manifest-path app\src-tauri\Cargo.toml` passed: 43 tests passed.
- 2026-07-06: `git diff --check` passed with CRLF normalization warnings only and no whitespace errors.
