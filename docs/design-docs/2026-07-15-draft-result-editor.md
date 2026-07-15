# 文字稿结果：只读预览 → 可编辑 + 落盘 + 重新生成 设计方案

## Status

2026-07-15 完成需求盘问（五问五答）与代码验证（Path A），决策锁定，待实现。

是父规格 [`2026-07-12-generate-draft-from-inspiration`](../product-specs/2026-07-12-generate-draft-from-inspiration.md) 的增量：把 `生成文字稿` 结果从**只读预览**改造为**左右分栏可编辑器 + 本地落盘 + 可重新生成**。与 [`2026-07-15-draft-platform-selection`](./2026-07-15-draft-platform-selection.md) 是兄弟增量——本方案不动平台链路，平台仍按那份设计的「请求态」处理。

相关文档：执行计划 [`2026-07-15-draft-result-editor-plan.md`](../exec-plans/active/2026-07-15-draft-result-editor-plan.md)、产品规格 [`2026-07-15-draft-result-editor.md`](../product-specs/2026-07-15-draft-result-editor.md)。

## 1. 背景

`生成文字稿` 落地后，结果由 `app/src/features/results/DraftResultSheet.tsx` 渲染：

- 把 `workflow.draft`（markdown 字符串）丢给 `MarkdownContent`（`react-markdown` + remark-gfm + rehype-sanitize + `skipHtml`）做**只读预览**。
- 工具区只有「复制」（复制 markdown）+「导出」（`getTaskArtifactPath(workflow,"draft")` 定位本地 `ai/draft.md` 文件，非浏览器下载）。
- 卡片 ready 后按钮变为「查看结果」——**没有「已生成状态下重新生成」的路径**（`AiTargetCard` 仅在 `failed` 时显示「重新生成」）。
- `ai/draft.md` 由 worker 在生成时一次性写入；前端只读，无写回通道。

盘问暴露三个待解问题，验证后落实如下：

1. **编辑归属 / 落盘**：手改的 markdown 存哪、怎么落盘。
2. **重生冲突**：重新生成会产出新稿，手改内容如何处置。
3. **重生输入来源**：「和第一次一样」到底复用哪些输入。

验证关键发现：

- `app/src-tauri/src/transcript_detail.rs` 已有**完整的本地写回先例**：`load_transcript_detail` / `save_transcript_edit` 两个 tauri 命令，含路径穿越、软链、隔离任务、空值等全套安全校验，并在首次编辑前把原稿一次性备份到 `transcript/original/`。本方案照搬这套模式到 draft。
- 偏好快照（`PreferenceSnapshot`）由 worker 从盘 `ai/preference-snapshot.json` 读取，前端在 `target="draft"` 请求中**不携带**（父规格 Architecture Boundary）。→ 重新生成天然复用，前端无需做任何事。
- 种子 `draft_seed_insight_id` 已持久化进任务 manifest（父规格 Draft Artifact Schema），但 `HistoryDetailView`（`app/src-tauri/src/history.rs:44`）**既不带 `draft`、也不带 `draft_seed_insight_id`**。→ 从历史重开任务时 `workflow.draft` 为空，当前**历史里根本看不到草稿**（「查看结果」只在当次会话有效）。
- 平台是**请求态**，不持久化、不进 manifest、不回写档案（platform-selection 设计锁定）。→ 「复用上次平台」无存储来源。

## 2. 目标

- 结果视图改为**左右分栏**：左侧 `textarea` 编辑 markdown 原文，右侧 `MarkdownContent` 渲染预览（与摘要/灵感详情渲染一致）。
- 编辑**落盘覆盖 `ai/draft.md`**，走本地 tauri 命令，**不上 server**。
- 「复制」「下载」均基于**编辑器当前文本**（markdown 原文）；「导出（定位文件）」降级保留为次要入口。
- 新增「**重新生成**」入口：默认一键复用上次种子 + 偏好快照（平台重新推导）；种子缺失时退化到完整选择 UI；编辑过则二次确认。
- 顺带修复「历史看不到草稿」的旧缺口（编辑器打开时按需从盘读）。

## 3. 范围

### 3.1 做

- tauri：新增 `load_draft_detail` / `save_draft_edit` 命令（照搬 `transcript_detail.rs` 安全模式）。
- 前端：`DraftResultSheet` 改造为分栏编辑器 + 工具区（复制 / 下载 / 导出 / 重新生成）+ dirty 二次确认 + 下载 Blob。
- 前端：`workflowState` 加 `draftEdited` 标志 + draft 编辑 action + 重生成功重置 dirty。
- 前端：重新生成接线（一键复用入口 + 缺失退化到 `DraftConfirmationSheet`）。

### 3.2 不做

- 不引入 CodeMirror / Monaco（左侧用裸 `textarea`，零新依赖）。
- 不改右侧渲染保真度（复用 `MarkdownContent`：HTML 仍剥离、Mermaid 仍显示为代码块）。
- 不持久化平台（尊重 platform-selection 的请求态原则；重生时平台重新推导）。
- 不新增 server 接口或字段（父规格红线：FrameQ server 不存草稿）。
- 不做多版本 / 编辑历史快照（仅 `ai/original/draft.md` 一次性备份，对齐 transcript）。
- 不改 draft 生成链路（worker 侧零改动；偏好快照 / summary 仍 worker 从盘读）。

## 4. 数据源与状态模型

编辑器数据源**统一为 `load_draft_detail`**：打开结果视图时按需从盘读 `ai/draft.md`，不再依赖 `workflow.draft` 是否被填充。这样：

- 当次会话：worker 生成后 `ai/draft.md` 已落盘，`load_draft_detail` 返回最新内容。
- 历史：`HistoryDetailView` 不带 draft 的旧缺口被绕过——编辑器直接从盘读，历史也能查看 / 编辑 / 重生。

状态：

- `workflow.draft`：保留，作为卡片「已生成」状态判定与编辑器初始缓冲。
- `workflow.draftEdited: boolean`：在 `textarea` 改过即置 `true`；重新生成成功后置 `false`（新 AI 产出即新基线）。用于二次确认触发。
- `ai/original/draft.md`：首次编辑前一次性备份 AI 原产出，既是 dirty 基线参考，也是「想找回 AI 原稿」的恢复点（对齐 `transcript/original/`）。

## 5. 落盘写回（tauri 本地命令）

照搬 `transcript_detail.rs` 的命令结构与安全约束。新增 `app/src-tauri/src/draft_detail.rs`：

### 5.1 `load_draft_detail({ task_id })`

- 解析 runtime paths → `task_manifest::load_task_manifest` → `ensure_task_source_privacy_ready`（拒隔离 / 旧格式任务）。
- 经 `task_manifest::required_artifact_path(task_dir, manifest, "draft")` 取 `ai/draft.md` → `validate_task_artifact_path` + `reject_linked_artifact_target`。
- 读 `ai/draft.md` 全文（缺失则空串 + `has_draft=false`）。
- 返回 `DraftDetailView { task_id, markdown, has_original_backup, draft_seed_insight_id }`。
  - `draft_seed_insight_id` 从 manifest 读出回传前端，供历史一键重生复用种子。

### 5.2 `save_draft_edit({ task_id, markdown })`

- 同样路径解析 + 隐私就绪校验 + `required_artifact_path("draft")` + 路径校验 + 软链拒绝。
- **非空校验**：`markdown.trim()` 为空则报错（对齐 transcript 拒空文本）。
- **一次性 original 备份**：`ai/original/draft.md` 不存在时拷贝当前 `ai/draft.md`（仅首次编辑存，后续不覆盖）。
- `fs::write(ai/draft.md, "{markdown}\n")` 原子写。
- 更新 manifest：确保 `draft_path` / `has_draft` 在场；写 `draft_preview`（首 180 字符，类比 `text_preview`）；`draft_seed_insight_id` 不动。
- 返回 `SaveDraftEditResult { task_id, markdown, artifacts, has_original_backup }`。

### 5.3 安全约束（与 transcript 完全对齐）

- 路径穿越：`validate_task_artifact_path` 强制 draft 路径必须落在 `ai/draft.md`。
- 软链 / reparse point：`reject_linked_artifact_target` 拒绝目标及其父目录是链接。
- 隔离任务：`ensure_task_source_privacy_ready` 拒未迁移 / quarantined 任务。
- 空内容：trim 后为空拒绝。
- 全部失败 recoverable，返回明确错误串，不 panic、不写半文件。

## 6. 复制 / 下载 / 导出

- **复制**：编辑器当前文本 → `navigator.clipboard.writeText`。
- **下载**：构造 `Blob([text], {type: "text/markdown"})`，`URL.createObjectURL` + `<a download>` 触发浏览器下载；文件名取草稿首行 `# 标题`，缺失则 `{taskId}.md`；源 = 编辑器当前文本。
- **导出（定位文件）**：保留 `getTaskArtifactPath(workflow, "draft")`，本地有 `taskDir` 时作为次要入口（桌面端「在文件夹打开」仍有用）。
- **dirty 一致性**（对齐 transcript Decision Log）：复制可用编辑器当前文本；**下载 / 导出在 dirty（未保存）时提示先保存**，避免下载到与盘上不一致的内容。

## 7. 重新生成

入口：`DraftResultSheet` 工具区「重新生成」按钮（仅 `workflow.draft` 非空或 `has_draft` 时可用）。

1. **dirty 拦截**：`workflow.draftEdited === true` 时弹二次确认「将丢弃当前编辑（含已落盘的 `ai/draft.md`），是否继续？」。确认后继续；取消则不动。
2. **默认一键复用**（种子可得时）：
   - 种子：`workflow.draftSeedInsightId`（当次会话）或 `load_draft_detail` 回传的 `draft_seed_insight_id`（历史）。
   - 偏好快照：前端**不传**，worker 从盘 `ai/preference-snapshot.json` 读（天然复用）。
   - 平台：重新从灵感档案推导默认（见第 8 节）。
   - 调既有 `retry_insights`（`target="draft"`，带 `insight_id` + `platform`）。
3. **退化到完整选择 UI**（种子缺失时）：打开 `DraftConfirmationSheet`，让用户重选种子 + 偏好 + 平台，再走首次生成流程。
4. **配额 / 账号校验照走**：`canGenerateAiWithAccount` 不通过则 `openAccountPanel`，与首次生成一致；不绕过 checkout。
5. **重生成功**：`finishInsightRetry(state, result, "draft")` 重置 `workflow.draftEdited = false`（新基线），并刷新 `ai/original/draft.md` 为新 AI 产出（下次编辑的基线）。

## 8. 平台的处理（与 platform-selection 的张力）

platform-selection 锁定「平台是请求态、不持久化」。因此「一键复用上次平台」**没有存储来源**——上次手动改选的平台不在盘上。决策：

- 重新生成时，平台走**与首次相同的「从灵感档案推导默认」**逻辑（`platforms` 恰好 1 个可映射→预选，否则 `other`）。
- 用户若要非默认平台，在「退化完整选择 UI」或确认步重选。

取舍：手动改选的平台**不跨重生保留**。接受此取舍以避免破坏 platform-selection 的请求态原则；未来若要保留，需另行修改 platform-selection 持久化平台（超出本方案范围）。

## 9. 改动点（代码级）

### 9.1 tauri（`app/src-tauri/src`）

- **新增 `draft_detail.rs`**：
  - `load_draft_detail(app, LoadDraftDetailRequest{task_id}) -> Result<DraftDetailView, String>`。
  - `save_draft_edit(app, SaveDraftEditRequest{task_id, markdown}) -> Result<SaveDraftEditResult, String>`。
  - draft artifact key = `"draft"`，路径 `{task_dir}/ai/draft.md`，original 备份 `{task_dir}/ai/original/draft.md`。
  - 安全校验全部复用 `task_manifest`（`required_artifact_path` / `validate_task_artifact_path` / `ensure_artifact_parent`）+ 本文件内 `ensure_task_source_privacy_ready` / `reject_linked_artifact_target`（从 `transcript_detail.rs` 抽公共或复制）。
- **`task_manifest`**：draft artifact 路径解析 / 校验复用既有（`draft_path` 已在 manifest schema）；`draft_seed_insight_id` 读取；新增 `draft_preview` 写入（类比 `text_preview`）。
- **`lib.rs`**：注册 `load_draft_detail` / `save_draft_edit` 两个命令到 `invoke_handler`。

### 9.2 前端（`app/src`）

- **`draftDetailClient.ts`（新增，类比 `historyClient.ts` / `insightPreferencesClient.ts`）**：`loadDraftDetail(taskId)` / `saveDraftEdit(taskId, markdown)` 的 `invoke` 封装 + 返回值 normalize。
- **`workflowState.ts`**：
  - `WorkflowState` 加 `draftEdited: boolean`（初始 `false`）。
  - 加 `editDraft(state, markdown)` action（写 `draft` + 置 `draftEdited=true`）。
  - `finishInsightRetry` 的 `target==="draft"` 分支：成功时 `draftEdited=false`。
  - `createInitialWorkflow` / `startProcessing` 初始化 `draftEdited=false`。
- **`DraftResultSheet.tsx`**：
  - 打开时 `loadDraftDetail(taskId)` 取内容（替代直接读 `workflow.draft`）。
  - 左右分栏：左 `<textarea>`（受控，值 = 本地编辑缓冲），右 `<MarkdownContent markdown={buffer} />`。
  - 工具区：复制 / 下载（Blob）/ 导出（降级）/ 重新生成。
  - 编辑 → 标 dirty；保存 → `saveDraftEdit` + 清 dirty；下载 / 导出 dirty 时提示先保存。
  - 重新生成：dirty 二次确认 → 一键复用或退化。
- **重新生成接线（`App.tsx` / `useInsightGenerationController.ts`）**：暴露 `regenerateDraft` 入口——种子可得则一键 `retry_insights(target="draft", insight_id, platform=推导默认)`；缺失则开 `DraftConfirmationSheet`。

### 9.3 worker

- **零改动**。draft 生成链路（`generate_draft` / `retry_insights_once` draft 分支）不变；偏好快照、summary 仍由 worker 从盘读。重生复用走既有 `retry_insights` draft 分支。

## 10. 关键约束

- **本地优先**：落盘走 tauri 本地命令，绝不上 server（父规格「FrameQ server 不新增保存草稿的接口或字段」红线）。
- **安全**：照搬 transcript 的路径穿越 / 软链 / 隔离任务 / 空值校验，全部 recoverable。
- **渲染一致**：右侧复用 `MarkdownContent`（skipHtml + sanitize），与摘要 / 灵感详情一致。
- **平台请求态不变**：不持久化平台，重生时重新推导。
- **额度不变**：重生走既有 one-checkout，非法 / 取消 / 预检失败不扣额度。
- **状态单真相**：编辑写回 `workflow.draft` 并落盘；`draftEdited` 是脏标记，不另存编辑副本（original 备份除外）。

## 11. 备选方案（已否决）

- **A：编辑只存内存、不落盘**。否决（盘问 Q1 用户选「写回 + 落盘 `ai/draft.md`」）。
- **B：落盘走 server**。否决（父规格红线 + 本地优先；server 不存草稿）。
- **C：上 CodeMirror / Monaco 做语法高亮**。否决（盘问 Q5 选裸 textarea，零新依赖；仓库无编辑器依赖）。
- **D：重生不拦截、直接覆盖**。否决（盘问 Q2 选「编辑过就二次确认」）。
- **E：持久化平台以支持字面「复用上次平台」**。否决（破坏 platform-selection 请求态原则；改用「重新推导默认」）。
- **F：把 draft 内容塞进 `HistoryDetailView`**。否决（会让历史列表 payload 变重；改为按需 `load_draft_detail`，与 transcript 详情同模式）。

## 12. 风险与权衡

- **R1（平台不跨重生保留）**：手动改选的平台重生后回到档案推导默认。用户已知悉接受；未来要保留需改 platform-selection 持久化。
- **R2（original 备份一次性）**：多次编辑只保留首次 AI 原产出，不做多版本（对齐 transcript 决策）。
- **R3（历史重生退化）**：历史任务若 `load_draft_detail` 拿不到 `draft_seed_insight_id`（如灵感已重生成、id 失效）→ 退化到完整选择 UI；若 `ai/insights.json` 已不在，需先重生成灵感。
- **R4（textarea 体验）**：无语法高亮 / 行号 / 软换行优化；markdown 散文编辑够用，未来可平滑上 CodeMirror（左侧组件是唯一替换点）。
- **R5（下载文件名）**：标题取首行 `# H1`，无标题则 `{taskId}.md` 兜底。
- **R6（并发写）**：`save_draft_edit` 与 worker 生成同时写 `ai/draft.md` 的概率极低（生成期间 UI 禁用编辑），不额外加锁；依赖「生成期间禁用编辑」的既有约束。

## 13. 验收（对齐 product-spec Acceptance Criteria）

- 结果视图为左右分栏：左 `textarea` 可编辑 markdown 原文，右 `MarkdownContent` 实时预览；窄屏退化为上下堆叠。
- 编辑落盘覆盖 `ai/draft.md`，并首次编辑前生成 `ai/original/draft.md` 备份；再次编辑不覆盖 original。
- 「复制」「下载」均基于编辑器当前文本（markdown 原文）；下载产出 `.md` 文件，文件名为标题或 taskId。
- 「导出（定位文件）」在本地有 taskDir 时作为次要入口保留。
- 重新生成：种子可得时一键复用（种子 + 偏好快照从盘读 + 平台重新推导），缺失时退化到完整选择 UI；编辑过则二次确认。
- 重生成功后 `draftEdited` 重置、`ai/original/draft.md` 刷新为新基线。
- 历史任务打开结果视图能加载并编辑草稿（修复旧缺口）。
- 安全校验：路径穿越 / 软链 / 隔离任务 / 空内容均 recoverable 拒绝，不写半文件。
- 父规格全部验收项继续通过；平台请求态、额度模型、隐私边界不变。
