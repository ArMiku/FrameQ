# Progress

## 2026-06-27

- Read AGENTS, architecture, design, security, product spec, EasyDownload references, and active Xiaohongshu completion ExecPlan.
- Created local planning notes for this implementation pass.
- Added red tests for frontend Xiaohongshu input acceptance, `XHS_*` error copy, short-link Location/HTTPS retry, Brotli page decode, streaming/resumable `.part` writes, note-id extraction, and fallback output path selection.
- Implemented the Xiaohongshu fallback completion across worker parser/page/download logic, shared download reliability helpers, pipeline media selection, frontend workflow validation, and UI error mapping.
- Ran focused validation: `uv run pytest worker\tests\test_download_reliability.py worker\tests\test_xiaohongshu_fallback.py worker\tests\test_media.py worker\tests\test_cli.py -q`, `npm --prefix app test -- src/workflow.test.ts`, and `uv run ruff check worker`.
- Ran broader gates: `uv run pytest worker\tests`, `npm --prefix app test`, `npm --prefix app run build`, and `cargo test --manifest-path app\src-tauri\Cargo.toml`.
- Started Bilibili fallback pass: read active Bilibili ExecPlan, architecture/security/product boundaries, EasyDownload Bilibili reference docs, and `url.go`/`api.go`/`http.go`/`downloader.go`/`types.go`/`progress.go`.
- Added red Bilibili tests for frontend BV/av/b23.tv acceptance, structured UI errors, worker parser, short-link resolution, DASH stream selection, backup URL behavior, DRM rejection, part selection, safe `.m4s` download, and FFmpeg merge.
- Implemented `worker/frameq_worker/bilibili_fallback.py`, media fallback integration, and frontend Bilibili validation/error mapping. Focused validation passed: `uv run pytest worker\tests\test_bilibili_fallback.py worker\tests\test_media.py -q`, `npm --prefix app test -- src/workflow.test.ts`, and `uv run ruff check worker`.
- Ran full validation for the Bilibili pass and archived `docs/exec-plans/active/2026-06-27-bilibili-public-video-fallback-plan.md` to `docs/exec-plans/completed/2026-06-27-bilibili-public-video-fallback-plan.md`. Full gates passed: worker tests, app tests, app build, Rust tests, docs WARN validation, and `git diff --check`.
