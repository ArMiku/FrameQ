import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const accountCopyFiles = [
  ["App.tsx", new URL("./App.tsx", import.meta.url)],
  ["AccountSheet.tsx", new URL("./features/account/AccountSheet.tsx", import.meta.url)],
] as const;

describe("account copy", () => {
  test("uses activation and authorization wording instead of monthly-pass wording", () => {
    for (const [label, url] of accountCopyFiles) {
      const content = readFileSync(url, "utf8");

      expect(content, label).not.toContain("月卡");
    }
  });
});
