export const AI_CREDITS_LABEL = "AI Credits";

export function formatAiCreditsBalance(credits: number): string {
  return `${AI_CREDITS_LABEL} 余额：${credits}`;
}

export function formatAiCreditsAllocation(remaining: number, limit: number): string {
  return `${AI_CREDITS_LABEL}：${remaining} / ${limit}`;
}

export function getAiCreditsCostHint(): string {
  return "一次 AI 整理可能消耗多个 Credits。";
}

export function getAiCreditsDisclosureCopy(): string {
  return (
    "1 AI Credit = 1 次云端 LLM API 调用尝试；一次 AI 整理可能消耗多个 Credits，" +
    "按实际云端 LLM API 调用扣除 Credits；失败、超时或部分失败的已发起调用仍会扣除 Credits；" +
    "换个方向后再次确认会按新的实际调用扣除。"
  );
}
