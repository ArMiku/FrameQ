# Security and Compliance

<!-- 由 vibe-coding-launcher 生成。 -->

## Scope

FrameQ 涉及公开视频 URL、下载文件、本地音频、ASR 文字稿、可选 LLM API 和导出文件。本文件定义默认安全边界。

## Content Boundary

- 仅用于公开视频、用户自己发布的视频、已授权视频、内部研究或内容归档。
- 不实现绕过平台访问限制、批量抓取未授权内容、规避版权或隐私规则的能力。
- 如果使用浏览器 cookies，只能用于用户有权访问的内容，并且不得默认上传或持久化 cookies。

## Local Data

- `outputs/` 存放用户最终产物，默认不提交仓库。
- `work/` 存放中间文件和调试产物，默认不提交仓库。
- `models/` 存放模型权重缓存，默认不提交仓库。
- 删除任务或取消任务时，应明确哪些文件保留、哪些可清理。

## Secrets

- LLM API Key、代理地址和云端配置不得硬编码。
- 后续配置应来自本地设置、环境变量或系统安全存储。
- 日志不得输出完整密钥、cookies 或敏感请求头。

## External Services

- 下载、转码和 ASR 默认本地处理。
- 如果 InsightFlow 配置云端 LLM，必须在设置或运行提示中明确文字稿会发送到对应服务。
- worker 对外部服务错误必须返回结构化错误码，不得吞掉失败。

## Validation

涉及安全边界的改动至少需要：

- 检查 `.gitignore` 是否覆盖模型、输出、中间文件和密钥。
- 检查日志中不包含密钥、cookies 或完整敏感头。
- 在 spec 或 ExecPlan 中说明云端 LLM 数据流和用户提示。
