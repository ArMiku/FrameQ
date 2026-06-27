# Findings

## 2026-06-27 Xiaohongshu Fallback

- Governing docs require a worker-owned, video-only fallback for public or user-authorized Xiaohongshu notes.
- Supported inputs include share text, `xhslink.com` short links, full `xiaohongshu.com/explore/{note_id}` URLs with query parameters such as `xsec_token`, and direct 24-character note IDs.
- The fallback must preserve `xsec_token`, resolve short links via `3xx` `Location` and embedded HTML, decode `gzip`/`br`/`deflate`, parse `window.__INITIAL_STATE__`, rank video streams deterministically, and download with safe `.part` behavior.
- Out of scope: login, browser-cookie import, CAPTCHA bypass, proxy pools, private-note scraping, image album ZIPs, Live Photo sidecars, stream picker UI, and a download center.
- UI changes should remain limited to accepting the documented inputs and surfacing specific Chinese guidance for `XHS_*` structured failures.
- Implementation now uses explicit `brotli`, browser-like page headers, short-link HTTPS retry, resume-safe `Range` handling for existing `.part` files, and pipeline selection by fallback stdout path or Xiaohongshu note-id stem.
- Manual live public-link smoke was not performed because no stable public Xiaohongshu video link was provided in this session.

## 2026-06-27 Bilibili Fallback

- Governing docs require a worker-owned fallback for ordinary public Bilibili videos only.
- Supported inputs include ordinary `bilibili.com/video/BV...`, `bilibili.com/video/av...`, selected part query `?p=N`, and safe `b23.tv` short links that resolve to ordinary `/video/` pages.
- The worker should use public `x/web-interface/view` metadata and `x/player/playurl` DASH APIs, choose one video stream plus one audio stream, download `.m4s` safely, and merge them into one MP4 for the existing ASR pipeline.
- Out of scope: QR/account login, cookies, `SESSDATA`, PGC/bangumi/movie links, VIP/member-only streams, DRM/decryption, CAPTCHA bypass, proxies, batch queues, stream picker UI, and download-center behavior.
- UI changes should remain limited to accepting ordinary Bilibili-looking inputs and mapping `BILIBILI_*` worker errors to clear Chinese recovery guidance.
