# Tasks

## 进行中

- [ ] 连接 Tauri command、UI 进度与 worker pipeline ✅ 桌面流程能到达结果或结构化失败状态

## 待办

- [ ] 安装 Rust/Cargo 以解除 Tauri 桌面构建阻塞 ✅ `cargo -V` 成功且 `npm --prefix app run tauri -- build` 不再因 `program not found` 失败
- [ ] 运行真实 Qwen3-ASR 模型推理 ✅ `outputs/7524373044106677544_transcript.txt` 由真实 ASR 生成且非空

## 已完成

- [x] 内置并适配 InsightFlow 话题点生成（2026-06-16）✅ `outputs/7524373044106677544_insights.json` 包含非空 `insights`
- [x] 实现 ASR adapter 和 transcript writers（2026-06-16）✅ fake transcriber 生成非空 `outputs/7524373044106677544_transcript.txt` 与 `.md`
- [x] 实现下载与媒体校验服务（2026-06-16）✅ 示例 URL 创建 `outputs/7524373044106677544.mp4` 且 ffprobe JSON 有视频/音频流
- [x] 实现音频提取服务（2026-06-16）✅ `work/7524373044106677544.wav` 为 16 kHz 单声道 `pcm_s16le`
- [x] 初始化 `app/` Tauri + React + TypeScript 骨架（2026-06-16）✅ `npm --prefix app run build` 通过
- [x] 添加前端工作流状态模型和初始 UI（2026-06-16）✅ `npm --prefix app test` 4 tests passed
- [x] 初始化 `worker/` Python 包与 worker 入口（2026-06-16）✅ `uv run pytest worker\\tests` 5 tests passed
- [x] 初始化项目本地 `.venv` 并安装开发依赖（2026-06-16）✅ `uv run pytest worker\\tests` 使用 Python 3.12.13 通过
- [x] 用户确认首个 ExecPlan 并指定使用 `uv` 管理本项目环境（2026-06-16）✅ 用户回复“开始下一步吧”
- [x] 读取 `douyin_video_download_solution.md` 并建立项目治理核心集（2026-06-16）✅ `python scripts/validate_agents_docs.py --level ERROR` 通过
