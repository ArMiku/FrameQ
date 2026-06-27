# Bilibili Public Video Fallback Plan

This ExecPlan is a living document. The sections Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective must be kept up to date as work proceeds.

## Purpose / Big Picture

Add Bilibili ordinary public-video support to FrameQ by porting only the EasyDownload parser, public Web API, DASH stream selection, download reliability, and FFmpeg merge ideas that produce one local MP4 for transcription. Users should be able to paste a public Bilibili BV/av link or safe `b23.tv` short link and continue through the existing local video, audio, transcript, and optional AI整理 flow. Users should not see Bilibili login, QR login, cookie import, bangumi/VIP handling, DRM handling, stream-picker UI, batch download, or a download center.

## Progress

- [x] 2026-06-27: Reviewed EasyDownload Bilibili docs and implementation (`url.go`, `api.go`, `http.go`, `downloader.go`, `progress.go`) and FrameQ's current worker/media/frontend boundaries. Validation: `rg` and targeted `Get-Content` inspection in the side conversation.
- [x] 2026-06-27: Created this active ExecPlan and synchronized product, architecture, security, task, and reference documentation before implementation. Validation: `python scripts\validate_agents_docs.py --level WARN` and `git diff --check` passed.
- [ ] 2026-06-27: Extend frontend input acceptance for ordinary Bilibili video URLs and safe `b23.tv` links. Validation: `npm --prefix app test -- app/src/workflow.test.ts`.
- [ ] 2026-06-27: Add worker Bilibili parser, short-link resolver, metadata client, and tests. Validation: `uv run pytest worker\tests\test_bilibili_fallback.py -q`.
- [ ] 2026-06-27: Add DASH stream selection, backup URL retry, and DRM/login/PGC rejection tests. Validation: `uv run pytest worker\tests\test_bilibili_fallback.py -q`.
- [ ] 2026-06-27: Add video/audio `.m4s` download and FFmpeg merge integration without changing the worker result JSON shape. Validation: `uv run pytest worker\tests\test_bilibili_fallback.py worker\tests\test_media.py -q`.
- [ ] 2026-06-27: Add UI error mapping for `BILIBILI_*` structured failures. Validation: `npm --prefix app test`.
- [ ] 2026-06-27: Run full validation and record results before moving this plan to completed. Validation: commands listed in Validation and Acceptance.

## Surprises & Discoveries

Evidence: FrameQ currently accepts Douyin and Xiaohongshu inputs in the frontend workflow, while Bilibili URLs are rejected before the worker can try `yt-dlp` or any fallback.

Evidence: EasyDownload detects both `bilibili.com` and `b23.tv`, but its ordinary URL parser only extracts BV/av from Bilibili video paths. FrameQ should add safe `b23.tv` short-link resolution and accept the final URL only when it resolves to an ordinary `/video/` page.

Evidence: EasyDownload's Bilibili implementation includes account login, QR login, SESSDATA persistence, PGC/bangumi APIs, and DRM-aware merge paths. These are explicitly outside FrameQ v1; only ordinary public video API and no-cookie DASH assembly are in scope.

Evidence: Ordinary Bilibili playback frequently returns separate DASH video and audio streams. Unlike Douyin/Xiaohongshu fallbacks, the Bilibili fallback needs FFmpeg merge as part of media acquisition before the existing `ffprobe` and ASR pipeline can continue.

Evidence: EasyDownload already handles camelCase and snake_case stream URL fields and backup URL arrays. Porting that compatibility matters more for reliability than exposing quality controls in the UI.

## Decision Log

Decision: Scope Bilibili v1 to ordinary public videos only. Rationale: This supports FrameQ's transcription workflow without adding account-aware download behavior or platform bypass mechanics. Date/Author: 2026-06-27 / User + Codex.

Decision: Keep `yt-dlp` as the first attempt and run Bilibili fallback only after a Bilibili-related failure. Rationale: Existing behavior remains stable and the fallback only fills public-link reliability gaps. Date/Author: 2026-06-27 / Codex.

Decision: Use `?p=N` to select one part and default to the first part. Rationale: FrameQ's current user flow processes one submitted source into one result set; batch multi-part download would change the product model. Date/Author: 2026-06-27 / Codex.

Decision: Reject PGC/bangumi, member-only, login-required, and DRM streams with structured errors. Rationale: FrameQ does not collect cookies, automate login, store SESSDATA, or bypass access controls. Date/Author: 2026-06-27 / Codex.

Decision: Merge Bilibili DASH streams with the existing bundled FFmpeg and return a normal MP4 to the existing pipeline. Rationale: This keeps downstream `ffprobe`, audio extraction, ASR, history, and result UI unchanged. Date/Author: 2026-06-27 / Codex.

## Outcomes & Retrospective

Implementation has not started. This plan currently captures the intended scope, safety boundary, implementation tasks, and validation gates. Residual risk: Bilibili public APIs and CDN URLs may change or require login for some videos; FrameQ must surface structured recoverable errors instead of adding login, cookie, DRM, or private-content bypass behavior.

## Context and Orientation

Product/spec:

- `docs/product-specs/2026-06-16-douyin-video-transcription-client.md`
- `docs/references/easydownload-bilibili-fallback.md`
- `docs/references/easydownload-transcription-migration.md`

Frontend:

- `app/src/workflow.ts`
- `app/src/workflow.test.ts`
- `app/src/App.tsx`

Worker:

- `worker/frameq_worker/media.py`
- `worker/frameq_worker/download_reliability.py`
- `worker/frameq_worker/pipeline.py`
- `worker/tests/test_media.py`
- `worker/tests/test_download_reliability.py`
- `worker/tests/test_cli.py`

Bundled runtime mirror:

- `app/src-tauri/resources/worker/frameq_worker/media.py`
- `app/src-tauri/resources/worker/frameq_worker/download_reliability.py`

External reference:

- `lib-external/EasyDownload/docs/bilibili-link-download-principle.md`
- `lib-external/EasyDownload/internal/download/bilibili/url.go`
- `lib-external/EasyDownload/internal/download/bilibili/api.go`
- `lib-external/EasyDownload/internal/download/bilibili/http.go`
- `lib-external/EasyDownload/internal/download/bilibili/downloader.go`
- `lib-external/EasyDownload/internal/download/bilibili/progress.go`
- `lib-external/EasyDownload/internal/download/bilibili/types.go`

Docs and governance:

- `docs/ARCHITECTURE.md`
- `docs/SECURITY.md`
- `TASKS.md`
- `AGENTS.md`
- `docs/exec-plans/active/index.md`

## Plan of Work

1. Update frontend input acceptance.
   - Accept ordinary Bilibili BV URLs such as `https://www.bilibili.com/video/BV...`.
   - Accept ordinary av URLs such as `https://www.bilibili.com/video/av170001`.
   - Accept safe `b23.tv` short links, but reject empty short links and lookalike hosts.
   - Keep rejecting PGC/bangumi paths, unsupported schemes, non-Bilibili hosts, and text without one acceptable URL.

2. Add worker parser and safe short-link resolution.
   - Extract BV or av ID from ordinary `/video/` URLs.
   - Parse `?p=N` as the requested part index, defaulting to first part.
   - Resolve `b23.tv` with finite redirect depth, HTTPS preference, timeout, and final-host validation.
   - Return `BILIBILI_ID_PARSE_FAILED` or `BILIBILI_SHORT_LINK_RESOLVE_FAILED` for invalid inputs.

3. Add Bilibili public API client.
   - Request `x/web-interface/view` by BV or aid.
   - Parse title, aid, bvid, owner, duration, and `pages`.
   - Validate selected part and cid.
   - Request `x/player/playurl` with `fnval=4048`, `fnver=0`, and `fourk=1`.
   - Detect login-required, unavailable, empty-DASH, PGC/bangumi, and DRM cases.

4. Add DASH stream selection.
   - Parse video/audio stream fields with camelCase and snake_case compatibility.
   - Merge and dedupe backup URLs.
   - Prefer AV1, then HEVC, then H.264, with higher bandwidth as tie-breaker.
   - Choose the highest-bandwidth audio stream.
   - Return `BILIBILI_NO_PLAYABLE_STREAM`, `BILIBILI_LOGIN_REQUIRED`, or `BILIBILI_DRM_PROTECTED` when appropriate.

5. Add DASH download and merge.
   - Download video and audio `.m4s` streams through shared safe download helpers.
   - Try backup URLs before returning `BILIBILI_DASH_DOWNLOAD_FAILED`.
   - Merge with existing FFmpeg using stream copy into `<stem>.mp4`.
   - Clean up temporary files only after a successful merge, and preserve useful partials on cancellation/failure according to existing worker conventions.
   - Validate the merged MP4 with existing media validation before ASR.

6. Integrate with media pipeline and UI errors.
   - Keep `yt-dlp` first and invoke fallback only for Bilibili-related download failures.
   - Ensure the resulting MP4 enters the existing audio extraction, ASR, history, transcript, summary, mindmap, and insight pipeline.
   - Add Chinese UI guidance for `BILIBILI_ID_PARSE_FAILED`, `BILIBILI_SHORT_LINK_RESOLVE_FAILED`, `BILIBILI_VIDEO_INFO_UNAVAILABLE`, `BILIBILI_PART_NOT_FOUND`, `BILIBILI_NO_PLAYABLE_STREAM`, `BILIBILI_LOGIN_REQUIRED`, `BILIBILI_DRM_PROTECTED`, `BILIBILI_DASH_DOWNLOAD_FAILED`, and `BILIBILI_FFMPEG_MERGE_FAILED`.

7. Sync docs, tests, and bundled worker resources.
   - Keep source worker and `app/src-tauri/resources/worker` copies synchronized.
   - Add focused unit tests before implementation where practical.
   - Record validation results in this plan before moving it to `completed/`.

## Validation and Acceptance

Repeatable commands:

- `uv run ruff check worker`
- `uv run pytest worker\tests`
- `npm --prefix app test`
- `npm --prefix app run build`
- `cargo test --manifest-path app\src-tauri\Cargo.toml`
- `python scripts\validate_agents_docs.py --level WARN`
- `git diff --check`

Manual acceptance:

- Paste a public Bilibili BV ordinary video URL and confirm the existing FrameQ workflow produces local video, audio, transcript, and optional AI整理 outputs.
- Paste a public Bilibili av ordinary video URL and confirm the same workflow.
- Paste a safe `b23.tv` short link that resolves to an ordinary Bilibili video and confirm resolution, download, merge, and ASR.
- Paste a multi-part video with `?p=2` and confirm FrameQ processes only the selected part.
- Try PGC/bangumi, login-required/member-only, and DRM-protected links and confirm the UI returns clear recoverable errors without asking for cookies or login.
- Confirm `work/history.json`, logs, and UI errors do not contain cookies, SESSDATA, sensitive request headers, authorization material, or full volatile Bilibili CDN URLs.
