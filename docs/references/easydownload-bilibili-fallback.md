# EasyDownload Bilibili Public Video Fallback Reference

## Purpose

This reference records the EasyDownload Bilibili behavior that is useful for FrameQ's transcription-first desktop workflow. FrameQ should support public ordinary Bilibili videos well enough to produce one local MP4 for ASR, but it must not become a Bilibili download center or account-aware downloader.

## Source

- Local reference project: `lib-external/EasyDownload`
- License: MIT, see `lib-external/EasyDownload/LICENSE`
- Checked docs:
  - `lib-external/EasyDownload/docs/bilibili-link-download-principle.md`
- Checked implementation areas:
  - `lib-external/EasyDownload/internal/download/bilibili/url.go`
  - `lib-external/EasyDownload/internal/download/bilibili/api.go`
  - `lib-external/EasyDownload/internal/download/bilibili/http.go`
  - `lib-external/EasyDownload/internal/download/bilibili/downloader.go`
  - `lib-external/EasyDownload/internal/download/bilibili/progress.go`
  - `lib-external/EasyDownload/internal/download/bilibili/types.go`

## Migration Decision

Immediately useful:

- Ordinary video URL parsing: accept `https://www.bilibili.com/video/BV...`, `https://www.bilibili.com/video/av...`, `www.bilibili.com/video/...`, and safe `b23.tv` short-link resolution when the final URL is an ordinary `/video/` page.
- Ordinary public video metadata lookup through `https://api.bilibili.com/x/web-interface/view?bvid={bvid}` or `?aid={aid}`.
- Part selection for the existing single-submit workflow: use `?p=N` when present and valid, otherwise use the first part.
- DASH stream lookup through `https://api.bilibili.com/x/player/playurl?bvid={bvid}&cid={cid}&fnval=4048&fnver=0&fourk=1`.
- DASH field compatibility: support `baseUrl`/`base_url`, `backupUrl`/`backup_url`, `frameRate`/`frame_rate`, and `mimeType`/`mime_type`.
- Stream choice: prefer AV1 (`codecid=13`) over HEVC (`codecid=12`) over H.264 (`codecid=7`), and use higher `bandwidth` as the tie-breaker inside the same codec family. Choose the highest-bandwidth audio stream.
- Backup URL retry: promote a backup URL when the main URL is missing, dedupe URLs, and try backup URLs before surfacing failure.
- DASH assembly: download selected video and audio `.m4s` streams separately, then merge through the existing bundled FFmpeg with `-c copy` into the normal FrameQ MP4 output.
- Progress mapping: report download progress as video/audio weighted by byte size and reserve the final merge stage as a distinct worker phase.

Deferred:

- User-selectable quality, codec policy, or stream picker UI. The MVP should choose automatically for transcription and local preservation.
- Multi-part batch processing. FrameQ v1 should process one selected part per submitted URL.
- Better handling for very high quality streams that need a logged-in account. Public no-cookie streams are enough for this phase.

Do not migrate:

- Bilibili QR login, account login automation, `SESSDATA` collection, `SESSDATA` storage, browser cookie import, or credential storage.
- PGC/bangumi/movie links such as `/bangumi/play/ep...`, `/bangumi/play/ss...`, or `/bangumi/media/md...`.
- VIP/member-only access, paid content, private content, CAPTCHA/risk-control bypass, or account-authenticated scraping.
- DRM or `bilidrm` decryption behavior. FrameQ should return a structured unsupported-content error when Bilibili marks a stream as DRM-protected.
- EasyDownload's full download-manager model, queue state, pause/resume UI, Wails/Vue UI, tray behavior, or broad Bilibili platform surface.

## FrameQ Boundary

- UI and Tauri continue to submit the original source string and receive the existing worker JSON shape. They may validate that a source looks like Bilibili, but they must not call Bilibili APIs, choose streams, manage cookies, or expose a Bilibili-specific download UI.
- The Python worker owns Bilibili parsing, safe short-link resolution, Web API calls, DASH stream selection, `.m4s` download, FFmpeg merge, validation, and structured error mapping.
- `yt-dlp` remains the first attempt. Bilibili fallback runs only after a Bilibili-related `yt-dlp` failure and only for ordinary public videos.
- Runtime code must not import from `lib-external/EasyDownload`; the external project remains a design and algorithm reference.
- Logs and local history may keep the submitted URL, Bilibili ID, selected part index, short error code, quality label, byte sizes, and local output paths. They must not store cookies, `SESSDATA`, sensitive headers, authorization material, or full volatile media CDN URLs.

## Expected Worker Errors

- `BILIBILI_ID_PARSE_FAILED`: no ordinary BV/av ID could be parsed.
- `BILIBILI_SHORT_LINK_RESOLVE_FAILED`: a `b23.tv` link did not resolve to a safe ordinary Bilibili video URL.
- `BILIBILI_VIDEO_INFO_UNAVAILABLE`: the public video info API failed or returned an unavailable video.
- `BILIBILI_PART_NOT_FOUND`: the requested `?p=N` part does not exist.
- `BILIBILI_NO_PLAYABLE_STREAM`: the playurl API returned no usable public DASH video/audio stream.
- `BILIBILI_LOGIN_REQUIRED`: the requested stream requires account credentials or higher-quality authenticated access.
- `BILIBILI_DRM_PROTECTED`: the selected or only available stream is DRM-protected.
- `BILIBILI_DASH_DOWNLOAD_FAILED`: video or audio `.m4s` download failed across all URLs.
- `BILIBILI_FFMPEG_MERGE_FAILED`: FFmpeg could not merge the downloaded streams into MP4.

## Implementation Pointers

- Add source worker code near `worker/frameq_worker/media.py` as `worker/frameq_worker/bilibili_fallback.py`, plus focused tests under `worker/tests/`.
- Keep bundled Tauri worker resources in `app/src-tauri/resources/worker/` synchronized when implementation starts.
- Reuse or extend `worker/frameq_worker/download_reliability.py` for streaming `.part` writes, Range validation, no-progress timeout, maximum-size guardrails, and backup URL retries.
- Use the existing FFmpeg runtime path used by the worker media service; do not add a second FFmpeg discovery path.
- Output one normal MP4 under the configured output directory, then let the existing `ffprobe`, audio extraction, ASR, history, transcript, summary, mindmap, and insight pipeline continue unchanged.
