# Execution Gates

<!-- 由 vibe-coding-launcher 生成。 -->

## Purpose

本文件定义 FrameQ 任务完成前必须满足的检查。验证应与风险成比例，并在最终交付中可见。

## Hard Gates

- 受影响代码路径、文档事实来源或方案来源已 inspect。
- 文档结构验证通过：`python scripts/validate_agents_docs.py --level ERROR`。
- touched active ExecPlan 的 Progress、Decision Log 和验证记录已更新。
- 架构、安全、流程、运行时 contract 或导出行为变化已同步到 durable docs。
- 涉及 worker 的改动必须至少运行 focused Python 测试或等价命令。
- 涉及 app/UI 的改动必须至少运行 lint、typecheck 或 build 中的一项。
- 涉及下载、ASR、LLM 或文件导出的改动必须记录失败路径和可恢复行为。

## Soft Gates

- 更广范围回归测试。
- 桌面端手动运行检查。
- 依赖或安全扫描。
- 打包验证。
- 模型下载和低资源降级路径验证。

跳过相关软门禁时，在最终说明或 active ExecPlan 中记录原因和残余风险。

## Definition Of Done

1. 请求行为已实现、修复，或明确记录为 out of scope。
2. 所有受影响区域的硬门禁通过。
3. 相关 spec、design doc、security doc、architecture doc、AGENTS map 或 ExecPlan 已同步。
4. 新技术债已记录到 active plan 或 `docs/exec-plans/tech-debt-tracker.md`。
5. 最终交付列出 Passed、Not run 和 Residual risk。
