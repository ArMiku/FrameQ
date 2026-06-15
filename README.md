# FrameQ

FrameQ is a desktop client for turning a Douyin video URL into a local video file,
transcript, and InsightFlow-style inspirational discussion prompts.

The current product and technical source of truth is
`douyin_video_download_solution.md`.

## Planned MVP

- Tauri desktop shell with React and TypeScript.
- Python worker for `yt-dlp`, `ffprobe`, `ffmpeg`, Qwen3-ASR, and embedded
  InsightFlow prompt generation.
- Local-first processing for downloaded video, extracted audio, and transcripts.
- Export transcript and insight results as `txt`, `md`, and `json`.

## Project Governance

Start with `AGENTS.md`, then follow `WORKFLOW.md` and the active ExecPlan under
`docs/exec-plans/active/`.

```powershell
python scripts/validate_agents_docs.py --level ERROR
```
