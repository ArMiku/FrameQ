# Build MVP Douyin Video Transcription Desktop Client

This ExecPlan is a living document. The sections Progress, Surprises & Discoveries,
Decision Log, and Outcomes & Retrospective must be kept up to date as work proceeds.

## Purpose / Big Picture

完成后，用户可以在桌面客户端中粘贴一个抖音视频 URL，并获得本地视频文件、完整文字稿和启发话题点。用户能通过 UI 看到处理进度、复制结果并导出文件。

## Progress

- [ ] 2026-06-16: App shell scaffolded and initial UI states render.
- [ ] 2026-06-16: Python worker scaffolded with structured request/result schema.
- [ ] 2026-06-16: Download, media validation, and audio extraction pipeline works for the sample URL.
- [ ] 2026-06-16: ASR transcript pipeline writes `.txt` and `.md` outputs.
- [ ] 2026-06-16: Embedded InsightFlow topic generation writes `.json` and `.md` outputs.
- [ ] 2026-06-16: Tauri command connects UI to worker with progress, cancel, retry, and export paths.
- [ ] 2026-06-16: Focused validation passes and residual risks are documented.

## Surprises & Discoveries

- Evidence: `douyin_video_download_solution.md` records that the sample URL download produced a valid MP4 with HEVC video, AAC audio, 1024x576 resolution, and about 271.3 seconds duration.

## Decision Log

- Decision: Use Tauri + React + TypeScript + Python ASR Worker. Rationale: lightweight desktop shell, mature UI ecosystem, and direct access to Python ASR tooling. Date/Author: 2026-06-16 / Codex, from accepted ADR-001.
- Decision: Use `Qwen/Qwen3-ASR-0.6B` as default ASR model. Rationale: Chinese-focused quality with lower resource demand than 1.7B. Date/Author: 2026-06-16 / Codex, from accepted ADR-002.
- Decision: Copy and embed only the required InsightFlow modules into this repo. Rationale: desktop app must be independently packaged and cannot depend on a local reference path. Date/Author: 2026-06-16 / Codex, from accepted ADR-003.

## Outcomes & Retrospective

Not started. Update this section when the plan is completed, canceled, or replaced. Record passed validation, skipped checks, residual risks, and follow-up work.

## Context and Orientation

- `douyin_video_download_solution.md` is the source product and technical design.
- `docs/product-specs/2026-06-16-douyin-video-transcription-client.md` defines user-visible scope and acceptance.
- `docs/ARCHITECTURE.md` defines planned module boundaries.
- `docs/DESIGN.md` defines UI states and interaction rules.
- `docs/SECURITY.md` defines content, local data, secrets, and external service boundaries.
- `TASKS.md` stores the current recovery checkpoint; detailed execution tasks are in `2026-06-16-mvp-desktop-client-tasks.md`.

## Plan of Work

1. Bootstrap `app/` with Tauri + React + TypeScript and render the input, processing, completion, partial-completion, and failure states.
2. Bootstrap `worker/` with request/result schema, structured errors, logging, and filesystem layout helpers.
3. Implement download, `ffprobe` validation, and `ffmpeg` audio extraction for a single URL.
4. Add ASR adapter for `Qwen/Qwen3-ASR-0.6B`, with model path configuration and low-resource failure handling.
5. Copy and adapt required InsightFlow modules into `worker/insightflow/`, returning `insights` instead of user-facing “questions”.
6. Wire Tauri command to worker execution, progress updates, cancel/retry behavior, result cards, detail modal, copy, and export.
7. Add focused tests and manual validation notes for the sample URL flow.

## Concrete Steps

Workdir: project root.

1. Create the app shell:

```powershell
npm create tauri-app@latest app -- --template react-ts
```

Expected output: `app/` exists with a React TypeScript Tauri project.

2. Install app dependencies and verify the scaffold:

```powershell
npm --prefix app install
npm --prefix app run build
```

Expected output: dependency install succeeds and build exits with code 0.

3. Create the worker environment:

```powershell
py -3.11 -m venv .venv
.\\.venv\\Scripts\\python -m pip install -U pip
```

Expected output: `.venv/` exists and pip upgrades without error.

4. Install worker MVP dependencies after confirming package availability:

```powershell
.\\.venv\\Scripts\\python -m pip install yt-dlp qwen-asr modelscope pytest ruff
```

Expected output: packages install without error.

5. Implement worker services under `worker/` and run focused tests:

```powershell
.\\.venv\\Scripts\\python -m pytest worker\\tests
```

Expected output: focused worker tests pass.

6. Validate docs and frontend build before claiming the MVP complete:

```powershell
python scripts/validate_agents_docs.py --level WARN
npm --prefix app run build
```

Expected output: document validation has 0 errors and app build exits with code 0.

## Validation and Acceptance

- Documentation: `python scripts/validate_agents_docs.py --level ERROR` returns 0 errors.
- Frontend: `npm --prefix app run build` returns 0 after app scaffold exists.
- Worker tests: `.\\.venv\\Scripts\\python -m pytest worker\\tests` returns 0 after worker tests exist.
- Media pipeline: sample URL produces MP4, valid `ffprobe` JSON, and 16 kHz mono WAV.
- ASR pipeline: transcript `.txt` and `.md` are non-empty.
- Insight pipeline: insights `.json` contains a non-empty `insights` array, or UI enters `部分完成` while preserving transcript.
- Desktop behavior: user can submit URL, see progress, cancel during processing, open result details, copy text, and export files.
