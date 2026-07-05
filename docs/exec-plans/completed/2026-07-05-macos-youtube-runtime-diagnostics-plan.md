# macOS YouTube Runtime Diagnostics Plan

This ExecPlan is a living document. The sections Progress, Surprises &
Discoveries, Decision Log, and Outcomes & Retrospective must be kept up to date
as work proceeds.

## Purpose / Big Picture

FrameQ should explain and diagnose the macOS Apple Silicon YouTube extraction
failure without weakening the no-cookie/no-login boundary. The desktop app will
write sanitized app-local logs, and the worker will make `yt-dlp` JavaScript
runtime selection explicit so packaged or system runtimes can be used.

## Progress

- [x] 2026-07-05: Investigated screenshot and source path. Evidence: `yt-dlp`
  2026.06.09 defaults `--js-runtimes` to `deno` only, while FrameQ currently
  bundles Python, worker, and ffmpeg/ffprobe but no JS runtime. Validation:
  `uv run python -m yt_dlp --help`.
- [x] 2026-07-05: Add tests for explicit YouTube JS runtimes and sanitized
  desktop log writing. Validation: `uv run pytest worker\tests\test_media.py -q`
  and `cargo test --manifest-path app\src-tauri\Cargo.toml`.
- [x] 2026-07-05: Implement command/runtime diagnostics and log persistence.
  Validation: `cargo test --manifest-path app\src-tauri\Cargo.toml`.
- [x] 2026-07-05: Run docs and relevant project gates. Validation:
  `python scripts\validate_agents_docs.py --level WARN`, `uv run pytest
  worker\tests -q`, `uv run ruff check worker`, and `git diff --check`.

## Surprises & Discoveries

Evidence: `worker/frameq_worker/media.py` builds YouTube downloads with
`python -m yt_dlp --no-playlist -f ... --merge-output-format mp4`, but does not
pass `--js-runtimes`.

Evidence: `scripts/build-installer.mjs` validates `import yt_dlp` but does not
bundle or smoke-test `deno`, `node`, `quickjs`, or `bun` inside
`resources/bin`.

Evidence: `app/src-tauri/src/lib.rs` captures worker stderr for progress events,
but successful structured worker JSON failures are returned to the UI without a
durable desktop log.

## Decision Log

Decision: Enable `deno`, `node`, `quickjs`, and `bun` explicitly for YouTube
`yt-dlp` invocations. Rationale: This preserves the public-video/no-cookie
boundary while allowing system or packaged runtimes to be used. Date/Author:
2026-07-05 / Codex.

Decision: Add local desktop diagnostics under app-local data
`logs/frameq-desktop.log`. Rationale: The failing machine may not be available
to reproduce locally, and logs are the least invasive evidence path. Date/Author:
2026-07-05 / Codex.

Decision: Do not bundle Deno in this change. Rationale: It requires release
artifact source/secret wiring and installer size review; document it as residual
risk after adding diagnostics. Date/Author: 2026-07-05 / Codex.

## Outcomes & Retrospective

FrameQ now records sanitized desktop diagnostics under app-local data
`logs/frameq-desktop.log` for worker process lifecycle, exit status, structured
result summaries, and JavaScript runtime availability. YouTube `yt-dlp`
invocations now explicitly enable `deno`, `node`, `quickjs`, and `bun`, so
available packaged or system runtimes can be used without adding cookies or
login behavior.

Validation passed:

- `uv run pytest worker\tests\test_media.py -q`
- `cargo test --manifest-path app\src-tauri\Cargo.toml`
- `python scripts\validate_agents_docs.py --level WARN`
- `uv run pytest worker\tests -q`
- `uv run ruff check worker`
- `git diff --check`

Residual risk: The current macOS Apple Silicon package still does not bundle a
JavaScript runtime such as Deno. The explicit runtime flags improve machines
that already have a supported runtime and make diagnostics clear, but a clean
Mac may still fail on YouTube videos that require player JavaScript until the
release pipeline adds a bundled runtime in `resources/bin`.

## Context and Orientation

- Spec: `docs/product-specs/2026-07-05-desktop-diagnostics-logs.md`
- Worker: `worker/frameq_worker/media.py`, `worker/tests/test_media.py`
- Tauri: `app/src-tauri/src/lib.rs`, `app/src-tauri/Cargo.toml`
- Packaging: `scripts/build-installer.mjs`, `.github/workflows/desktop-release.yml`
- Docs: `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/DESIGN.md`

## Plan of Work

1. Add failing tests for YouTube command runtime flags and desktop log redaction.
2. Implement explicit `yt-dlp --js-runtimes` arguments for YouTube.
3. Implement app-local desktop log directory creation, append-only log writing,
   and sensitive-value redaction in Tauri.
4. Log worker start, exit, stderr diagnostics, and structured worker result
   summaries for process, retry-insights, and model-download commands.
5. Update architecture/security/design docs and run focused validation.

## Validation and Acceptance

- `uv run pytest worker\tests\test_media.py`
- `cargo test --manifest-path app\src-tauri\Cargo.toml`
- `python scripts\validate_agents_docs.py --level WARN`
- `git diff --check`

Manual acceptance: On a clean macOS Apple Silicon machine, a failed YouTube
extraction should leave `logs/frameq-desktop.log` with a sanitized structured
error summary and enough runtime context to see whether a supported JS runtime
was available.
