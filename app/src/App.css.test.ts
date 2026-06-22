import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const appCss = readFileSync(new URL("./App.css", import.meta.url), "utf-8");

function getRuleBody(selectors: string[]): string {
  const selectorPattern = selectors
    .map((selector) => selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s*,\\s*");
  const match = appCss.match(new RegExp(`${selectorPattern}\\s*\\{(?<body>[\\s\\S]*?)\\}`));
  return match?.groups?.body ?? "";
}

describe("App result workspace layout styles", () => {
  test("stacks the header, error message, and result cards in normal vertical flow", () => {
    const baseResultAreaRule = getRuleBody([".result-workspace", ".result-area"]);
    const activeResultAreaRule = getRuleBody([
      ".workspace.active-layout .result-workspace",
      ".workspace.active-layout .result-area",
    ]);

    expect(baseResultAreaRule).toContain("display: flex;");
    expect(baseResultAreaRule).toContain("flex-direction: column;");
    expect(activeResultAreaRule).not.toContain("grid-template-rows");
  });

  test("keeps the desktop surfaces on a macOS-like layered visual system", () => {
    const rootRule = getRuleBody([":root"]);
    const toolbarRule = getRuleBody([".app-toolbar", ".topbar"]);
    const panelRule = getRuleBody([
      ".command-panel",
      ".process-monitor",
      ".result-workspace",
      ".input-pane",
      ".process-pane",
      ".result-area",
    ]);
    const resultCardHoverRule = getRuleBody([".result-card:hover"]);

    expect(rootRule).toContain("--shadow-panel");
    expect(toolbarRule).toContain("saturate");
    expect(panelRule).toContain("var(--shadow-panel)");
    expect(panelRule).toContain("backdrop-filter");
    expect(resultCardHoverRule).toContain("translateY(-1px)");
  });
});
