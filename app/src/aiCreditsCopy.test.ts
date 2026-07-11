import { describe, expect, test } from "vitest";

import {
  formatAiCreditsAllocation,
  formatAiCreditsBalance,
  getAiCreditsCostHint,
  getAiCreditsDisclosureCopy,
} from "./aiCreditsCopy";

describe("AI Credits copy", () => {
  test("describes the balance and variable per-generation cost without promising action counts", () => {
    expect(formatAiCreditsBalance(8)).toBe("AI Credits 余额：8");
    expect(formatAiCreditsAllocation(8, 20)).toBe("AI Credits：8 / 20");
    expect(getAiCreditsCostHint()).toBe("一次 AI 整理可能消耗多个 Credits。");

    const disclosure = getAiCreditsDisclosureCopy();
    expect(disclosure).toContain("1 AI Credit = 1 次云端 LLM API 调用尝试");
    expect(disclosure).toContain("一次 AI 整理可能消耗多个 Credits");
    expect(disclosure).not.toContain("确认后消耗 1 次");
  });
});
