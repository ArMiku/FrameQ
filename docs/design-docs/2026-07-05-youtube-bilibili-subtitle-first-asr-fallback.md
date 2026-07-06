# 字幕优先 + ASR 兜底 设计方案

| 字段   | 值                                                                                        |
| ---- | ---------------------------------------------------------------------------------------- |
| 状态   | Approved（进入 ExecPlan / 实现）                                                                  |
| 创建日期 | 2026-07-05                                                                               |
| 作者   | WorkBuddy                                                                                |
| 关联文档 | `AGENTS.md`、`docs/ARCHITECTURE.md`、`docs/SECURITY.md`、`docs/design-docs/core-beliefs.md` |
| 决策性质 | 改变 worker 转写流水线，新增可选快速路径；不改变 ASR 兜底行为；不动外部分发边界                                           |

## 1. 背景

FrameQ 当前所有平台都固定走"下载视频 → 抽 16k 单声道 wav → SenseVoice/Qwen ASR → AI 整理"流程（见 [`worker/frameq_worker/pipeline.py`](file:///d:/Github/FrameQ/worker/frameq_worker/pipeline.py) `run_worker_pipeline`）。代码库内全文搜索 `subtitle` / `caption` / `srt` / `vtt` 均无命中，确认从未尝试复用平台/上传者提供的字幕轨。

YouTube 与 Bilibili 等大量视频自带字幕（人工或自动生成）。在 ASR 之前探测一次字幕，命中即可跳过一段 3–8 分钟的本地推理，是当前最直接的"提升速度"路径。

Douyin 与小红书的公开分享页基本不暴露字幕轨，命中概率极低，不在本方案范围内。

## 2. 目标

- 在 ASR 之前增加一道"字幕探测"步骤；命中时直接产出文字稿，跳过 ASR；未命中时静默降级到现有 ASR 路径。
- 仅在 YouTube 与 Bilibili 的 `yt-dlp` 成功下载路径启用字幕探测；Bilibili public fallback 路径不下载/复用字幕，仍走现有 ASR 路径。
- Douyin / 小红书保持现状。
- v1 的产品目标是"保留视频/音频产物，只节省 ASR 时间"：即使命中字幕，仍保持现有视频保存、媒体校验、音频抽取和结果卡片能力，只跳过 ASR 模型加载与本地推理。
- 文字稿来源在 task manifest 和 `transcript.md` metadata 中显式记录；v1 只记录"平台字幕/ASR"和字幕语言，不识别、不展示、不保存人工字幕/自动字幕类型。

## 3. 范围

### 3.1 做

- YouTube 任务，以及 Bilibili 的 `yt-dlp` 成功下载路径，在 `TaskPaths.download_dir`（`cache/tasks/<task_id>/download/` 临时区）落地 `*.vtt` / `*.srt` 后被自动识别并复用为文字稿。
- Bilibili public fallback 成功下载的视频不在 v1 尝试字幕复用；该路径继续抽取音频并走 ASR，避免把 fallback 能力误判为完整字幕能力。
- 字幕解析为 `TranscriptSegment`（`start_ms` / `end_ms` / `text`），由来源感知的通用 transcript writer 写出 `transcript.txt`、`transcript.md`、`segments.json`。
- `frameq-task.json` 升级到 `schema_version: 2`，新增 `transcript` 对象记录文字稿来源。
- 字幕命中时跳过 ASR 模型加载与推理；未命中时走原 ASR 路径。
- UI 详情里显示"来源：平台字幕（zh-Hans）"或"来源：本地 ASR"。

### 3.2 不做

- Douyin、小红书不增加字幕探测（命中率极低，价值不匹配）。
- Bilibili public fallback 不增加字幕探测；该路径仍以"公开下载视频成功 + 本地 ASR 转写"为 v1 边界。
- 不引入新依赖；不替换 ASR；不改变 ASR 失败码。
- 不识别、不展示、不保存字幕是人工字幕还是自动字幕；v1 统一视为"平台字幕"。
- 不做语义级字幕清洗、字幕与 ASR 校对合并、字幕时间轴修正（v1 之后再说）；基础字幕解析规范化属于 v1 必做项。
- 不在 manifest 中保存完整字幕文本，只保留预览、来源和语言标签；原始 `.vtt/.srt` 留在 `TaskPaths.download_dir`（`cache/tasks/<task_id>/download/` 临时区）。

## 4. 流水线改动点

### 4.1 yt-dlp 命令（[`media.py:107-128`](file:///d:/Github/FrameQ/worker/frameq_worker/media.py#L107-L128)）

在 `build_ytdlp_command` 中新增平台限定的字幕参数集合，只在 YouTube 和 Bilibili URL 命中时插入到对应 `yt-dlp` 命令的 URL 参数之前；Douyin、小红书和其他通用下载路径不追加字幕参数。

```
--write-subs
--write-auto-subs
--sub-langs <默认顺序：zh-Hans,zh-CN,zh-Hant,en,ja,ko>
--sub-format vtt/srt/best
```

说明：

- YouTube 专属分支（`should_attempt_youtube_processing(url)` 为真）追加这组字幕参数。
- Bilibili URL 在进入通用 `yt-dlp` 命令时追加这组字幕参数，但该参数集合不得扩散到 Douyin、小红书或其他 generic URL。
- Bilibili 仅在上述 `yt-dlp` 成功下载路径复用字幕参数；若 `yt-dlp` 失败后进入 `download_bilibili_video` public fallback，fallback 不补抓字幕，后续按"未检测到字幕"处理并走 ASR。
- `--no-playlist` 现有纪律不变。
- `--sub-format` 使用 parser 友好的 `vtt/srt/best` 偏好顺序，优先拿 worker v1 明确支持的 `.vtt` / `.srt`；`best` 只作为平台可用格式兜底，不承诺所有兜底格式都可解析。
- 不使用 `--convert-subs srt`：字幕是加速项，不应让字幕格式转换失败影响视频下载成败；worker 直接解析 `yt-dlp` 原生落地的 `.vtt` / `.srt`。
- 字幕文件实际写到 `TaskPaths.download_dir`，即 `cache/tasks/<task_id>/download/<id>.<lang>.srt` / `.vtt`；大小通常 < 100KB。

### 4.2 字幕探测步骤（插入 [`pipeline.py:302-313`](file:///d:/Github/FrameQ/worker/frameq_worker/pipeline.py#L302-L313) 之间）

位置：抽完音频、加载 ASR 模型之前。

该位置是有意选择：字幕命中时仍保留现有 `video.mp4`、`audio.wav`、音频回听、历史任务和结果卡片行为；本快速路径只减少 ASR 模型加载与推理耗时，不跳过视频下载、媒体探测、视频复制或音频抽取。

伪流程：

```text
1. 抽取音频完成 → audio.wav 已就位
2. 字幕探测（在现有 VIDEO_TRANSCRIBING 阶段内执行的子步骤，不新增 JobStage）
   a. 扫描 `TaskPaths.download_dir` 中可解析的 *.vtt / *.srt，按默认 lang 顺序选最佳语言
   b. 若找到：
      - 解析并基础规范化为 TranscriptSegment[]
      - 调来源感知的通用 transcript writer 写出 transcript.txt / .md / segments.json
      - writer metadata 使用 source=subtitle、language=<lang>、engine=null
      - 跳过 ASR，直接进 run_insight_generation_step
      - 进度文案："已检测到 <lang> 字幕，跳过 ASR。"
   c. 若未找到，或 Bilibili 进入 public fallback 路径：
      - 走原 ASR 路径
      - 进度文案："未检测到字幕，开始 ASR。"
3. 字幕解析异常 → 一律降级到 ASR，不报错
```

### 4.3 字幕基础解析规范化

v1 不做润色、纠错、语义重写、字幕与 ASR 校对合并，也不尝试修正复杂时间轴漂移。但字幕文件进入正式文字稿前必须完成基础解析规范化，避免把格式控制内容写进 `transcript.md`。

基础规则：

- 支持 `.srt` 和 `.vtt`，兼容逗号/句点毫秒格式，例如 `00:00:01,200` 与 `00:00:01.200`。
- 只把 `.srt` / `.vtt` 且解析成功的文件视为字幕命中；若 `yt-dlp` 只落地了其他格式，v1 视为"无可用字幕"并降级 ASR。
- 忽略 VTT 控制内容，例如 `WEBVTT`、`NOTE`、`STYLE`、`REGION`、cue id、cue setting（如 `align:start`、`position:0%`）。
- 移除字幕文本中的简单 HTML/XML 标签和样式标签，例如 `<c>...</c>`、`<i>...</i>`、`<00:00:01.500>`。
- 对文本做最小规范化：HTML entity 反转义、去掉首尾空白、折叠连续空白行。
- 跳过空 cue；解析后如果没有有效文本，视为"无可用字幕"并降级 ASR。
- 对相邻 cue 做轻量去重：连续文本完全相同，或当前文本只是上一条的重复滚动版本时，只保留信息量更完整的一条。
- 解析失败、时间戳非法、有效文本过短或有效 segment 数为 0 时，一律降级 ASR，不阻断任务。

### 4.4 transcript writer 与 Markdown 元数据

当前 [`asr.write_transcript_files`](file:///d:/Github/FrameQ/worker/frameq_worker/asr.py#L337-L389) 虽然名字像通用写稿函数，但实际要求 `model` 参数，并在 [`_format_transcript_markdown`](file:///d:/Github/FrameQ/worker/frameq_worker/asr.py#L633-L645) 中固定写入 `- Model: {model}`。字幕命中时不得直接复用这个 ASR 语义 writer，否则会把平台字幕误标为 SenseVoice/Qwen ASR 结果。

决策：

- 新增来源感知的通用 transcript writer，建议放在 `worker/frameq_worker/transcripts.py`。
- `TranscriptSegment`、`TranscriptArtifacts` 可迁移到该模块，或先保持兼容导出；关键是写文件 API 不再以 ASR `model` 作为必填语义。
- ASR 路径和字幕路径都调用同一个通用 writer；ASR 只负责产生 `Transcript`，不再拥有"文字稿产物格式"的唯一解释权。
- `transcript.md` 是后续 AI 整理的输入，因此 metadata 必须真实反映文字稿来源。
- Tauri `save_transcript_edit` 当前会保留 `## Transcript` 前缀；实现时应继续保留 metadata。若 `transcript.md` 缺失而需要重建，则从 manifest 的 `transcript` 对象生成正确 metadata。

推荐数据结构：

```python
@dataclass(frozen=True)
class TranscriptMetadata:
    source: Literal["asr", "subtitle"]
    language: str | None = None
    engine: str | None = None
    source_url: str | None = None
```

字幕路径写入：

```python
write_transcript_files(
    text=subtitle_text,
    output_dir=task_context.paths.transcript_dir,
    output_stem="",
    metadata=TranscriptMetadata(
        source="subtitle",
        language=subtitle_lang,
        engine=None,
        source_url=request.url,
    ),
    segments=subtitle_segments,
)
```

ASR 路径写入：

```python
write_transcript_files(
    text=asr_text,
    output_dir=task_context.paths.transcript_dir,
    output_stem="",
    metadata=TranscriptMetadata(
        source="asr",
        language=None,
        engine=request.model,
        source_url=request.url,
    ),
    segments=asr_segments,
)
```

字幕命中时的 Markdown：

```markdown
# 视频文字稿

## Metadata

- Transcript Source: Platform subtitle
- Subtitle Language: zh-Hans
- Source URL: https://...

## Transcript

...
```

ASR 路径的 Markdown：

```markdown
# 视频文字稿

## Metadata

- Transcript Source: Local ASR
- ASR Engine: iic/SenseVoiceSmall
- Source URL: https://...

## Transcript

...
```

字幕路径不得写入 `Model: iic/SenseVoiceSmall`、`Model: Qwen/Qwen3-ASR-0.6B` 或任何会暗示"这份文字稿由 ASR 生成"的 metadata。

`ProcessResult` 增加可选 `transcript` 元数据字段，`run_asr_transcript_step`、字幕探测成功路径、`run_insight_generation_step` 和 `result_with_task` 都必须透传该字段，避免 AI 整理完成后 `finalize_task_result` 写 manifest 时丢失来源。`generate_insights=false` 的早返回分支会重新构造 `ProcessResult(status=COMPLETED, text=...)`，实现时必须同时复制 `transcript=transcript_result.transcript`，不能只保留正文。同步更新 `contracts/desktop-worker-contract.json`、Rust `ProcessVideoResult`、TS `WorkerResult`、history item 类型和 `cached_process_result_from_manifest`，让新任务完成后和历史任务恢复时都能读取同一份 `transcript` 元数据。

### 4.5 task manifest（[`task_store.py:223-244`](file:///d:/Github/FrameQ/worker/frameq_worker/task_store.py#L223-L244)）

manifest 升级到 `schema_version: 2`。顶层 `model` 字段继续保留，表示当前任务配置的本地 ASR 兜底模型；本次文字稿的实际来源和实际引擎由新增 `transcript` 对象表达。读取旧 `schema_version: 1` task manifest 时，可将缺失的 `transcript` 视为 `{"source": "asr", "language": null, "engine": <model>}`，保证已生成任务仍可恢复。

新增 `transcript` 对象：

```json
{
  "schema_version": 2,
  "model": "iic/SenseVoiceSmall",
  "transcript": {
    "source": "subtitle",
    "language": "zh-Hans",
    "engine": null
  }
}
```

ASR 路径：

```json
{
  "schema_version": 2,
  "model": "iic/SenseVoiceSmall",
  "transcript": {
    "source": "asr",
    "language": null,
    "engine": "iic/SenseVoiceSmall"
  }
}
```

字段说明：

| 字段                  | 类型                    | 说明                                      |
| ------------------- | --------------------- | --------------------------------------- |
| `transcript.source` | `"subtitle" \| "asr"` | 文字稿来源                                   |
| `transcript.language` | `string \| null`      | 命中字幕的语言标签，例如 `zh-Hans`；ASR 时为 `null`    |
| `transcript.engine` | `string \| null`      | ASR 引擎标识；字幕路径为 `null`                    |
| `model` | `string` | 当前任务配置的本地 ASR 兜底模型；字幕命中时仍保留，表示兜底配置，不表示本次文字稿来源 |

顶层 `model` 字段不改名，Tauri `TaskManifest`、worker `task_context_from_manifest`、重复任务缓存匹配逻辑继续读取 `model`。`model` 表示"如果需要 ASR，本任务应使用哪个本地 ASR 模型"；`transcript.engine` 表示"这份文字稿实际由哪个引擎生成"。字幕路径下 `transcript.engine` 为 `null`，避免把平台字幕误标为 ASR 结果。

不新增 `subtitle.kind`、`manual`、`auto` 等字段。v1 不承诺判断字幕类型，UI 也不展示"人工字幕/自动字幕"。`artifacts` 仍只保存 `outputs/tasks/<task_id>/` 任务目录内最终产物的相对路径；完整字幕文本不进 manifest；原始 `.vtt/.srt` 留在 `TaskPaths.download_dir`（`cache/tasks/<task_id>/download/`）由临时区清理规则处理。

## 5. 关键约束

1. **失败必须降级**：yt-dlp 返回 0 但没写出字幕文件 = 视作"无字幕"，不能报错，不能阻断任务。
2. **不破坏现有行为**：所有现有可能失败的错误码（`MEDIA_VALIDATION_FAILED` / `AUDIO_EXTRACTION_FAILED` / `ASR_MODEL_NOT_READY` 等）保持不变。
3. **语言优先级可配**：默认 `--sub-langs` 用 `zh-Hans,zh-CN,zh-Hant,en,ja,ko` 顺序；不强制要求用户改设置即可跑。
4. **平台字幕注意**：v1 不区分人工字幕和自动字幕；字幕语言来自平台/下载器声明，可能是翻译字幕，UI 只提示"平台字幕"和语言标签，不承诺字幕类型。
5. **基础解析必须干净**：正式 transcript 不得包含 `WEBVTT`、`NOTE`、cue setting、时间戳控制行或 HTML/XML 样式标签。
6. **文字稿 metadata 必须来源感知**：字幕路径的 `transcript.md` 和 manifest 不得出现 ASR `Model` 语义；ASR 路径必须记录实际 ASR engine。
7. **进度语义**：字幕探测作为现有 `JobStage.VIDEO_TRANSCRIBING` 阶段内的子步骤执行，不新增 `JobStage`、worker progress contract 或前端阶段枚举；文案写"正在检测平台字幕"、"已检测到字幕，跳过 ASR"或"未检测到字幕，开始 ASR"。
8. **清理策略**：`TaskPaths.download_dir` 中的 `.vtt/.srt` 不复制到 `outputs/tasks/<task_id>/media/`；任务结束按现有临时区规则处理。
9. **不在敏感产物中出现字幕内容**：`frameq-task.json` 只写 `text_preview` 和 `transcript.language`，不写完整字幕。

## 6. 验收

- **核心场景**：挑 5 个 YouTube 链接（2 个已知无字幕、3 个有平台字幕）和 5 个 Bilibili BV 号，逐一跑通，统计：
  - 字幕命中率
  - 跳过 ASR 的耗时节省
  - 文本质量（与 ASR 结果对比）
- **Bilibili fallback 边界**：至少覆盖 1 个触发 public fallback 的 Bilibili 公开视频，确认 fallback 成功时不声明字幕命中，继续走 ASR 并产出与现有路径一致的文字稿。
- **降级回归**：所有现存的"无字幕/字幕缺失"任务必须走 ASR 并产出与现在一致的结果。
- **字幕解析单测**：覆盖 SRT、VTT、cue setting、`WEBVTT`/`NOTE`、HTML/XML 标签、重复滚动字幕、空 cue、非法时间戳和解析为空降级 ASR。
- **manifest 校验**：每条任务的 `frameq-task.json` 必须有 `schema_version: 2` 和 `transcript.source` 字段，取值与实际路径一致。
- **transcript writer 校验**：字幕命中时 `transcript.md` 必须写 `Transcript Source: Platform subtitle` 和字幕语言，且不得包含 `Model: iic/SenseVoiceSmall`/`Model: Qwen...`；ASR 路径必须写 `Transcript Source: Local ASR` 和实际 `ASR Engine`。
- **编辑保留校验**：保存编辑后的文字稿时，`transcript.md` 仍保留原 metadata 前缀，只替换 `## Transcript` 后的正文。
- **错误码兼容**：跑 `cargo test --manifest-path app\src-tauri\Cargo.toml`、`uv run pytest worker/tests`、`npm --prefix app test` 全部通过。
- **UI 校验**：任务详情面板正确显示"平台字幕/本地 ASR"来源和语言标签；不显示人工字幕/自动字幕类型。
- **文档校验**：`python scripts/validate_agents_docs.py --level WARN` 通过。

## 7. 风险与权衡

| 风险                          | 等级 | 缓解                                     |
| --------------------------- | -- | -------------------------------------- |
| 平台字幕语言不是原语言                 | 中  | 默认 lang 列表 + UI 提示语言来自平台声明               |
| 平台字幕时间轴漂移                   | 低  | 可接受，文本正确即可；后续可校                        |
| 字幕文件膨胀 `TaskPaths.download_dir` | 低  | 体积通常 < 100KB，临时区可定期清理                  |
| 字幕格式噪声污染正式文字稿               | 中  | v1 做基础解析规范化；异常或空结果一律降级 ASR             |
| 字幕解析失败导致整任务挂掉               | 中  | 解析异常一律降级到 ASR                          |
| 字幕被误标为 ASR 结果                 | 中  | 抽出来源感知通用 transcript writer；字幕路径禁止写 ASR `Model` metadata |
| Bilibili fallback 路径被误认为支持字幕 | 中  | v1 明确仅 `yt-dlp` 成功路径尝试字幕；fallback 路径仍走 ASR |
| 用户期望"字幕一定优于 ASR"            | 中  | UI 文案统一为"平台字幕"，不承诺字幕类型或质量              |
| YouTube 字幕 zh-Hans 实际是翻译稿 | 中  | manifest 标 `transcript.language`，UI 提醒语言来自平台声明 |

## 8. 后续可考虑（不在本次范围）

- 字幕先转写、ASR 再校对合并（用 SenseVoice 给字幕做"清洗"）。
- 字幕时间轴对齐：平台字幕漂移用本地 ASR 时间戳校正。
- 设置面板暴露 `--sub-langs` 自定义顺序与"强制 ASR"开关。
- 字幕与 ASR 结果一致性比对，输出一致性指标到 manifest。
- 如后续确实需要区分字幕质量，再基于 yt-dlp metadata 增加可选 `transcript.subtitle.kind`，不在 v1 中提前承诺。
