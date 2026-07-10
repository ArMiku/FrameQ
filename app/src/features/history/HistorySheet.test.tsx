import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import type { HistoryItem } from "../../historyClient";
import { HistorySheet } from "./HistorySheet";
import type { HistoryController } from "./useHistoryController";

function createHistoryItem(): HistoryItem {
  return {
    taskId: "history-task",
    id: "history-task",
    createdAt: "2026-07-10T00:00:00.000Z",
    url: "https://www.example.test/history-video",
    status: "completed",
    taskDir: "D:/FrameQ/outputs/tasks/history-task",
    outputDir: "D:/FrameQ/outputs",
    artifacts: { transcript_txt: "transcript/transcript.txt" },
    error: null,
    textPreview: "history preview",
    insightsCount: 0,
    text: "history transcript",
    summary: "",
    transcript: null,
    insights: [],
  };
}

function createHistoryController(): HistoryController {
  return {
    historyOpen: true,
    historyItems: [createHistoryItem()],
    historyNotice: "",
    historyLoading: false,
    closeHistory: vi.fn(),
    openHistory: vi.fn(),
    openHistoryItem: vi.fn(),
  };
}

describe("HistorySheet selection accessibility", () => {
  test("renders active-workflow history rows as native disabled buttons with an explanation", () => {
    const markup = renderToStaticMarkup(
      <HistorySheet
        controller={createHistoryController()}
        formatHistoryDate={() => "2026-07-10"}
        selectionDisabled
        selectionDisabledReason="当前任务仍在处理中，完成或取消确认后才能恢复历史任务。"
      />,
    );

    expect(markup).toContain('id="history-selection-disabled-reason"');
    expect(markup).toContain("当前任务仍在处理中，完成或取消确认后才能恢复历史任务。");
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('aria-describedby="history-selection-disabled-reason"');
  });
});
