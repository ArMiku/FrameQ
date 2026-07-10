import type { WorkerErrorResult } from "./workflowState";

export function formatWorkerError(error: WorkerErrorResult): string {
  if (error.code === "VIDEO_DOWNLOAD_FAILED") {
    return formatVideoDownloadError(error.message);
  }

  if (error.stage === "insights_generating") {
    return formatInsightGenerationError(error);
  }

  if (error.code === "ASR_MODEL_NOT_READY") {
    return "真实 ASR 尚未启用。请用 FRAMEQ_ALLOW_REAL_ASR=1 启动应用，并确认 models/ 模型缓存目录可写。";
  }

  if (error.code === "ASR_MODEL_CACHE_UNAVAILABLE") {
    return "模型缓存目录不可写。请检查 FRAMEQ_MODEL_DIR 或项目 models/ 目录权限。";
  }

  if (error.code === "ASR_MODEL_NOT_DOWNLOADED") {
    return "ASR 模型尚未下载。请先在首启引导或设置中下载 ASR 模型，然后重新转写。";
  }

  return error.message;
}

function formatVideoDownloadError(message: string): string {
  const rawSummary = summarizeRawError(message);
  const lowerMessage = rawSummary.toLowerCase();
  const youtubeGuidance = formatYoutubeDownloadGuidance(lowerMessage);
  if (youtubeGuidance) {
    const youtubeSummary = summarizeRawError(sanitizeYoutubeRawSummary(rawSummary));
    return youtubeSummary
      ? `${youtubeGuidance}原始错误：${youtubeSummary}`
      : youtubeGuidance;
  }

  const bilibiliGuidance = formatBilibiliDownloadGuidance(lowerMessage);
  if (bilibiliGuidance) {
    return rawSummary
      ? `${bilibiliGuidance}原始错误：${rawSummary}`
      : bilibiliGuidance;
  }
  const xiaohongshuGuidance = formatXiaohongshuDownloadGuidance(lowerMessage);
  if (xiaohongshuGuidance) {
    return rawSummary
      ? `${xiaohongshuGuidance}原始错误：${rawSummary}`
      : xiaohongshuGuidance;
  }
  let guidance = "视频下载失败，请确认链接可公开访问后重试。";

  if (
    lowerMessage.includes("unsupported url") ||
    lowerMessage.includes("https://www.douyin.com/") ||
    lowerMessage.includes("404") ||
    lowerMessage.includes("not found")
  ) {
    guidance = "链接可能已过期或无效，请重新复制视频分享链接后再试。";
  } else if (
    lowerMessage.includes("douyin_no_playable_stream") ||
    lowerMessage.includes("douyin_stream_download_failed") ||
    lowerMessage.includes("douyin_share_page_unavailable") ||
    lowerMessage.includes("douyin_router_data_missing")
  ) {
    guidance = "抖音公开视频分享页暂时没有返回可播放的视频流，请确认链接公开可访问后重试。";
  } else if (
    lowerMessage.includes("login") ||
    lowerMessage.includes("sign in") ||
    lowerMessage.includes("cookie") ||
    lowerMessage.includes("captcha") ||
    lowerMessage.includes("verify") ||
    lowerMessage.includes("verification") ||
    lowerMessage.includes("not a bot")
  ) {
    guidance = "平台要求登录或验证，当前无法直接下载，请换公开视频链接或稍后重试。";
  } else if (
    lowerMessage.includes("timeout") ||
    lowerMessage.includes("timed out") ||
    lowerMessage.includes("network") ||
    lowerMessage.includes("connection")
  ) {
    guidance = "网络连接失败，请检查网络后重试。";
  }

  return rawSummary ? `${guidance}原始错误：${rawSummary}` : guidance;
}

function formatYoutubeDownloadGuidance(lowerMessage: string): string | null {
  if (lowerMessage.includes("youtube_login_required")) {
    return "YouTube 要求登录或验证，FrameQ 当前不使用 Cookie 或账号登录；请换公开视频链接后重试。";
  }

  if (lowerMessage.includes("youtube_age_restricted")) {
    return "该 YouTube 视频存在年龄、会员或访问限制，FrameQ 当前不会使用登录态绕过限制；请换公开视频后重试。";
  }

  if (lowerMessage.includes("youtube_private_or_unavailable")) {
    return "该 YouTube 视频不可公开访问、已删除或为私有内容，请确认链接公开可访问后重试。";
  }

  if (lowerMessage.includes("youtube_no_playable_stream")) {
    return "YouTube 暂时没有返回可下载的视频音频格式，请稍后重试或换一个公开视频链接。";
  }

  if (lowerMessage.includes("youtube_download_failed")) {
    return "YouTube 公开视频下载失败，请检查网络或换一个公开可访问的视频链接。";
  }

  return null;
}

function sanitizeYoutubeRawSummary(message: string): string {
  return message
    .replace(/https?:\/\/[^\s"'<>]*(?:googlevideo\.com|videoplayback)[^\s"'<>]*/gi, "[youtube media url removed]")
    .replace(/\s*(?:use|using|try|pass)?\s*--cookies(?:-from-browser)?[^\.\n]*(?:\.|$)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatBilibiliDownloadGuidance(lowerMessage: string): string | null {
  if (lowerMessage.includes("bilibili_drm_protected")) {
    return "该 Bilibili 视频包含 DRM 或受保护内容，FrameQ 当前不会尝试解密或绕过权限。";
  }

  if (lowerMessage.includes("bilibili_ffmpeg_merge_failed")) {
    return "Bilibili 视频和音频已下载但合并失败，请确认 FFmpeg 可用后重试。";
  }

  if (
    lowerMessage.includes("bilibili_unsupported_content") ||
    lowerMessage.includes("bilibili_login_required")
  ) {
    return "当前仅支持 Bilibili 普通公开视频，不支持番剧、影视、课程、会员或受保护内容。";
  }

  if (
    lowerMessage.includes("bilibili_id_parse_failed") ||
    lowerMessage.includes("bilibili_short_link_resolve_failed")
  ) {
    return "Bilibili 链接无法识别，请粘贴普通公开视频 BV/av 链接或有效 b23.tv 短链。";
  }

  if (
    lowerMessage.includes("bilibili_video_info_unavailable") ||
    lowerMessage.includes("bilibili_part_not_found")
  ) {
    return "Bilibili 公开视频信息暂时不可用，请确认分 P 存在且链接可公开访问后重试。";
  }

  if (
    lowerMessage.includes("bilibili_no_playable_stream") ||
    lowerMessage.includes("bilibili_dash_download_failed")
  ) {
    return "Bilibili 公开视频暂时没有返回可下载的视频音频流，请稍后重试或换一个公开视频链接。";
  }

  return null;
}

function formatXiaohongshuDownloadGuidance(lowerMessage: string): string | null {
  if (lowerMessage.includes("xhs_image_only")) {
    return "小红书图文笔记暂不支持转写，请换公开视频笔记链接后重试。";
  }

  if (
    lowerMessage.includes("xhs_note_blocked") ||
    lowerMessage.includes("xhs_note_not_found")
  ) {
    return "小红书笔记需要登录、已失效或不可公开访问，请确认是公开视频笔记后重试。";
  }

  if (lowerMessage.includes("xhs_rate_limited")) {
    return "小红书请求暂时被限流，请稍后重试。";
  }

  if (lowerMessage.includes("xhs_no_playable_stream")) {
    return "小红书公开视频暂时没有返回可播放的视频流，请重新复制公开视频链接后重试。";
  }

  if (
    lowerMessage.includes("xhs_initial_state_missing") ||
    lowerMessage.includes("xhs_initial_state_malformed") ||
    lowerMessage.includes("xhs_response_decode_failed") ||
    lowerMessage.includes("xhs_response_too_large")
  ) {
    return "小红书页面结构暂时无法解析，请稍后重试或重新复制公开视频链接。";
  }

  if (lowerMessage.includes("xhs_video_too_large")) {
    return "小红书视频超过当前安全下载大小限制，请换较短的公开视频后重试。";
  }

  if (lowerMessage.includes("xhs_download_stalled")) {
    return "小红书视频下载长时间没有进展，请检查网络后重试，或重新复制公开视频链接。";
  }

  if (
    lowerMessage.includes("xhs_stream_download_failed") ||
    lowerMessage.includes("xhs_page_unavailable") ||
    lowerMessage.includes("xhs_short_link_resolution_failed") ||
    lowerMessage.includes("xhs_id_parse_failed")
  ) {
    return "小红书公开视频下载失败，请确认链接可公开访问后重试。";
  }

  return null;
}

function summarizeRawError(message: string): string {
  const summary = message.replace(/\s+/g, " ").trim();
  if (summary.length <= 180) {
    return summary;
  }
  return `${summary.slice(0, 177)}...`;
}

function formatInsightGenerationError(error: WorkerErrorResult): string {
  const rawSummary = summarizeRawError(error.message);
  const appendRaw = (guidance: string): string =>
    rawSummary ? `${guidance}原始错误：${rawSummary}` : guidance;

  if (error.code === "INSIGHTFLOW_LLM_QUOTA_UNAVAILABLE") {
    return "启发灵感额度不足，请续费或请管理员调整额度后重试。";
  }

  if (error.code === "INSIGHTFLOW_LLM_AUTH_REQUIRED") {
    return "请先登录 FrameQ 账号，然后重新生成所选 AI 结果。";
  }

  if (
    error.code === "INSIGHTFLOW_CONFIG_MISSING" ||
    error.code === "INSIGHTFLOW_LLM_CONFIG_MISSING"
  ) {
    return "管理员尚未配置云端 LLM，配置完成后可重新生成所选 AI 结果。";
  }

  if (
    error.code === "INSIGHTFLOW_LLM_CHECKOUT_FAILED" ||
    error.code === "INSIGHTFLOW_LLM_CHECKOUT_TIMEOUT" ||
    error.code === "INSIGHTFLOW_LLM_CHECKOUT_INVALID_RESPONSE"
  ) {
    return appendRaw("无法获取云端 LLM 配置，请检查账号状态、管理员配置和本地服务后重试。");
  }

  if (error.code === "INSIGHTFLOW_LLM_REQUEST_TIMEOUT") {
    return appendRaw("云端 LLM 响应超时，请稍后重试或请管理员调大超时时间。");
  }

  if (error.code === "INSIGHTFLOW_LLM_REQUEST_FAILED") {
    return appendRaw("云端 LLM 请求失败，请检查管理员配置的服务地址、API key、模型权限或服务状态后重试。");
  }

  if (error.code === "INSIGHTFLOW_LLM_CONTENT_BLOCKED") {
    return appendRaw(
      "文字稿可能触发了云端 LLM 的内容安全策略，当前服务拒绝生成启发灵感。请确认视频内容可被该模型处理，或请管理员更换模型/供应商后重试。",
    );
  }

  if (error.code === "INSIGHTFLOW_EMPTY_RESULT") {
    return appendRaw("云端 LLM 没有返回可用的启发灵感，请稍后重试或更换模型配置。");
  }

  if (error.code === "INSIGHTFLOW_EMPTY_SUMMARY") {
    return appendRaw("云端 LLM 没有返回可用的要点总结，请稍后重试或更换模型配置。");
  }

  if (error.code === "INSIGHTFLOW_INVALID_MINDMAP") {
    return appendRaw("云端 LLM 返回的 Mermaid 思维导图格式不可用，请稍后重试或更换模型配置。");
  }

  if (error.code === "INSIGHTFLOW_EMPTY_TRANSCRIPT") {
    return "文字稿为空，暂时无法生成所选 AI 结果。";
  }

  if (error.code === "TRANSCRIPT_MARKDOWN_NOT_FOUND") {
    return "未找到文字稿 Markdown 文件，请重新运行主流程后再生成所选 AI 结果。";
  }

  if (error.code === "WORKER_PROCESS_FAILED" || error.code === "TAURI_COMMAND_FAILED") {
    return appendRaw("启发灵感生成进程异常退出，请保留文字稿并重试。");
  }

  return error.message;
}
