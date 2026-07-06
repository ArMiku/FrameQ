import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const appCss = readFileSync(new URL("./App.css", import.meta.url), "utf-8");
const appTsx = readFileSync(new URL("./App.tsx", import.meta.url), "utf-8");

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

  test("keeps account status and cancel controls in the desktop toolbar system", () => {
    const activeAccountRule = getRuleBody([".account-chip.active"]);
    const activeAccountIconRule = getRuleBody([".account-chip.active svg"]);
    const dangerButtonRule = getRuleBody([".danger-soft"]);
    const dangerHoverRule = getRuleBody([".danger-soft:hover"]);

    expect(activeAccountRule).toContain(
      "background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(239, 241, 245, 0.9));",
    );
    expect(activeAccountRule).toContain("border-color: var(--border);");
    expect(activeAccountRule).toContain("color: #34363b;");
    expect(activeAccountIconRule).toContain("color: var(--success);");
    expect(dangerButtonRule).toContain(
      "background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(239, 241, 245, 0.9));",
    );
    expect(dangerButtonRule).toContain("border-color: var(--border);");
    expect(dangerButtonRule).toContain("color: #b42318;");
    expect(dangerHoverRule).toContain("background: #fff7f5;");
  });

  test("uses explicit task copy for the processing cancel action", () => {
    expect(appTsx).toContain("<span>取消任务</span>");
  });

  test("uses a custom compact audio review bar instead of the browser audio controls", () => {
    expect(appTsx).toContain('className="audio-review-bar"');
    expect(appTsx).toContain('className="transcript-audio-engine"');
    expect(appTsx).not.toContain('className="transcript-audio"');
    expect(appTsx).not.toContain("controls\n");
  });

  test("keeps the custom audio review bar quiet and compact", () => {
    const barRule = getRuleBody([".audio-review-bar"]);
    const controlRule = getRuleBody([".audio-play-button", ".audio-review-actions button"]);
    const playButtonRule = getRuleBody([".audio-play-button"]);
    const scrubberRule = getRuleBody([".audio-review-scrubber"]);
    const webkitTrackRule = getRuleBody([".audio-review-scrubber::-webkit-slider-runnable-track"]);
    const webkitThumbRule = getRuleBody([".audio-review-scrubber::-webkit-slider-thumb"]);

    expect(barRule).toContain("min-height: 40px;");
    expect(barRule).toContain("padding: 4px 8px;");
    expect(controlRule).toContain("box-shadow: none;");
    expect(controlRule).toContain("height: 28px;");
    expect(playButtonRule).toContain("width: 28px;");
    expect(scrubberRule).toContain("appearance: none;");
    expect(webkitTrackRule).toContain("height: 4px;");
    expect(webkitThumbRule).toContain("height: 10px;");
    expect(webkitThumbRule).toContain("width: 10px;");
  });
});
