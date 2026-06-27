# EasyDownload Transcription-Oriented Migration Reference

## Purpose

This reference records the selected EasyDownload capabilities that are useful for FrameQ's transcription workflow. FrameQ should not become a general downloader. The migration direction is to improve public-link download success rate, safe media acquisition, and the local transcription experience while preserving the current UI, worker JSON contract, and privacy boundary.

## Source

- Local reference project: `lib-external/EasyDownload`
- License: MIT, see `lib-external/EasyDownload/LICENSE`
- Checked docs:
  - `lib-external/EasyDownload/docs/security-and-download-reliability.md`
  - `lib-external/EasyDownload/docs/douyin-link-download-principle.md`
  - `lib-external/EasyDownload/docs/xiaohongshu-link-download-principle.md`
  - `lib-external/EasyDownload/docs/bilibili-link-download-principle.md`
- Checked implementation areas:
  - `lib-external/EasyDownload/internal/download/`
  - `lib-external/EasyDownload/internal/download/douyin/`
  - `lib-external/EasyDownload/internal/download/xiaohongshu/`
  - `lib-external/EasyDownload/internal/download/bilibili/`
  - `lib-external/EasyDownload/internal/download/wechat/`
  - `lib-external/EasyDownload/internal/proxy/`
  - `lib-external/EasyDownload/internal/api/image_proxy.go`
  - `lib-external/EasyDownload/internal/config/config.go`

## Migration Decision

FrameQ should port only the small algorithms and safety patterns that help a user turn one public or user-authorized link into a local video file that can be transcribed. The port should be a Python worker implementation, not a runtime dependency on the Go/Wails EasyDownload app.

Immediately useful:

- Douyin input parsing enhancement: extract usable links and IDs from share text, canonical URLs, short-link redirects, `/note/{id}`, `/share/slides/{id}`, and `modal_id` or `aweme_id` query parameters where they resolve to playable public video.
- Generic safe download helper: stream to a temporary `.part` file, validate `Range` and `Content-Range`, apply no-progress timeouts, enforce a configured maximum size, and resume or retry only when the remote response makes that safe.
- Candidate fallback for media URLs: probe multiple public media candidates, collapse duplicates by verified size, prefer the best transcription-safe playable file, and try the next candidate if download or `ffprobe` validation fails.
- Xiaohongshu video fallback: resolve supported share text and `xhslink.com` links, parse public page state such as `__INITIAL_STATE__`, and extract a playable video stream only when the content is public or user-authorized.
- Bilibili ordinary public-video fallback: resolve BV/av and safe `b23.tv` inputs, read public Web API metadata, select one no-cookie DASH video/audio stream pair, download `.m4s` streams safely, and merge them into one MP4 for transcription.

Deferred:

- Douyin album or mixed-media posts, except when the public metadata exposes a normal playable video suitable for transcription.
- A background task queue or download manager. FrameQ currently processes one submitted URL through the transcription pipeline rather than acting as a batch downloader.
- Advanced platform-specific quality controls. The MVP policy should remain automatic and optimized for successful transcription plus preserving a usable local video.

Do not migrate:

- WeChat MITM proxy, certificate installation, system proxy changes, or administrator elevation.
- Browser cookie import, persistent cookie stores, account login automation, QR login, CAPTCHA handling, or private-content scraping.
- Bilibili login, SESSDATA handling, bangumi/PGC, member-only behavior, DRM/decryption, or full platform download workflows.
- Wails/Vue UI, tray integration, theme system, notification UX, image proxy, or a download-center product surface.
- Proxy pools, user-agent rotation, browser fingerprint spoofing, or anti-bot evasion mechanics.

## FrameQ Boundaries

- UI and Tauri continue to submit the original source URL and display structured worker state. They do not parse platform HTML, choose streams, or manage a download queue.
- The Python worker owns public-link fallback strategy, candidate probing, media download, validation, and structured error mapping.
- `yt-dlp` remains the first attempt for supported public links. Platform-specific fallbacks run only after matching failures and only inside the worker.
- Runtime code must not import from `lib-external/EasyDownload`; the external project remains a design and algorithm reference.
- No fallback may read browser cookies, persist cookies, upload cookies, install certificates, set system proxy, automate login, solve CAPTCHA, or bypass private content restrictions.
- Logs and local history may keep the submitted URL, short error summaries, hostnames, quality labels, byte sizes, and local output paths. They must not store cookies, sensitive headers, or full volatile media CDN URLs.

## Implementation Pointers

- Douyin-specific details are already captured in `docs/references/easydownload-douyin-fallback.md`.
- New download reliability code should live under `worker/frameq_worker/` near the current media/fallback modules and keep the existing worker result schema stable.
- New Xiaohongshu fallback behavior should be guarded by tests and share the same security boundary as Douyin: public or user-authorized links only, no login or CAPTCHA bypass.
- New Bilibili fallback behavior should be guarded by tests and share the same security boundary: ordinary public videos only, no cookies, no SESSDATA, no login, no PGC/bangumi, no member-only streams, and no DRM bypass.
- Product copy should describe these changes as improved public-link compatibility and reliability, not as a general downloader.
