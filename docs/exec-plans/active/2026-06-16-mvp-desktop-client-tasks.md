# MVP Desktop Client Tasks

## 进行中

- [ ] Confirm this ExecPlan with the user before implementation ✅ User explicitly confirms implementation should begin

## 待办

- [ ] Bootstrap `app/` Tauri React TypeScript scaffold ✅ `npm --prefix app run build` passes
- [ ] Add UI state model for input, processing, complete, partial complete, and failed states ✅ UI tests or build pass with state model compiled
- [ ] Bootstrap `worker/` Python package and request/result schema ✅ `.\\.venv\\Scripts\\python -m pytest worker\\tests` passes
- [ ] Implement download and media validation service ✅ Sample URL creates MP4 and valid ffprobe JSON
- [ ] Implement audio extraction service ✅ Sample MP4 creates 16 kHz mono WAV
- [ ] Implement ASR adapter and transcript writers ✅ Transcript `.txt` and `.md` are non-empty in `outputs/`
- [ ] Embed and adapt InsightFlow topic generation ✅ Insights `.json` contains non-empty `insights` or structured partial-complete error
- [ ] Wire Tauri command to worker and UI progress ✅ Desktop flow reaches result or structured failure state
- [ ] Add copy/export interactions ✅ Exported files match generated outputs

## 已完成

- [x] Create project governance, product spec, and initial ExecPlan（2026-06-16）✅ `python scripts/validate_agents_docs.py --level ERROR` passes
