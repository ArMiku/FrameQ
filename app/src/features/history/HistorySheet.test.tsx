import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import type { HistoryListItem } from "../../historyClient";
import { HistorySheet } from "./HistorySheet";
import type { HistoryController } from "./useHistoryController";

function createHistoryItem(overrides: Partial<HistoryListItem> = {}): HistoryListItem {
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
    ...overrides,
  };
}

function createHistoryController(
  historyItems = [createHistoryItem()],
  overrides: Partial<HistoryController> = {},
): HistoryController {
  return {
    historyOpen: true,
    historyItems,
    historyNotice: "",
    historyLoading: false,
    historyDeleteCandidate: null,
    historyDeleting: false,
    closeHistory: vi.fn(),
    openHistory: vi.fn(),
    openHistoryItem: vi.fn(),
    requestHistoryItemDeletion: vi.fn(),
    cancelHistoryItemDeletion: vi.fn(),
    confirmHistoryItemDeletion: vi.fn(),
    ...overrides,
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
        deletionDisabled
        deletionDisabledReason="当前任务仍在处理中，完成或取消确认后才能永久删除历史任务。"
      />,
    );

    expect(markup).toContain('id="history-selection-disabled-reason"');
    expect(markup).toContain("当前任务仍在处理中，完成或取消确认后才能恢复历史任务。");
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('aria-describedby="history-selection-disabled-reason"');
  });

  test("marks preview and URL fallback titles while preserving full card values", () => {
    const longChinesePreview = "这是一段很长的中文文字稿预览，用来确认历史任务标题具有明确的信息层级并且保留完整内容";
    const longEnglishPreview =
      "AnEnglishTranscriptPreviewWithOneUnbrokenWordThatMustStillClampReliablyAcrossTwoLines";
    const longYoutubeUrl =
      "https://www.youtube.com/watch?v=abcdefghijk&feature=share&this_is_a_long_safe_parameter=value";
    const longOutputDir =
      "D:/FrameQ/outputs/a-very-long-history-output-directory/with/additional/nested/folders";
    const failedCode = "HISTORY_ARTIFACT_UNAVAILABLE";
    const items = [
      createHistoryItem({ taskId: "zh", id: "zh", textPreview: longChinesePreview }),
      createHistoryItem({ taskId: "en", id: "en", textPreview: longEnglishPreview }),
      createHistoryItem({ taskId: "url", id: "url", textPreview: "", url: longYoutubeUrl }),
      createHistoryItem({ taskId: "dir", id: "dir", outputDir: longOutputDir }),
      createHistoryItem({
        taskId: "failed",
        id: "failed",
        status: "failed",
        error: { code: failedCode },
      }),
    ];

    const markup = renderToStaticMarkup(
      <HistorySheet
        controller={createHistoryController(items)}
        formatHistoryDate={() => "2026-07-10"}
        selectionDisabled={false}
        selectionDisabledReason=""
        deletionDisabled={false}
        deletionDisabledReason=""
      />,
    );

    expect(markup).toContain('class="history-title history-title-preview"');
    expect(markup).toContain('class="history-title history-title-url"');
    expect(markup).toContain(`title="${longChinesePreview}"`);
    expect(markup).toContain(`title="${longEnglishPreview}"`);
    expect(markup).toContain(`title="${longOutputDir}"`);
    expect(markup).toContain(`title="${failedCode}"`);
    expect(markup).toContain('class="history-meta-time"');
    expect(markup).toContain('class="history-meta-output"');
    expect(markup).toContain('class="history-meta-result"');
  });

  test("renders sibling restore and permanent-delete controls without nesting buttons", () => {
    const markup = renderToStaticMarkup(
      <HistorySheet
        controller={createHistoryController()}
        formatHistoryDate={() => "2026-07-10"}
        selectionDisabled={false}
        selectionDisabledReason=""
        deletionDisabled={false}
        deletionDisabledReason=""
      />,
    );

    expect(markup).toContain('class="history-item completed"');
    expect(markup).toContain('class="history-item-select"');
    expect(markup).toContain('class="history-item-delete"');
    expect(markup).toContain('aria-label="永久删除此历史任务"');
    expect(markup).toContain('title="永久删除"');
    const selectMarkup = markup.match(
      /<button class="history-item-select"[\s\S]*?<\/button>/,
    )?.[0];
    expect(selectMarkup?.match(/<button/g)).toHaveLength(1);
    expect(markup).toMatch(/<\/button><button class="history-item-delete"/);
  });

  test("renders an irreversible confirmation with cancel as the safe first action", () => {
    const item = createHistoryItem();
    const markup = renderToStaticMarkup(
      <HistorySheet
        controller={createHistoryController([item], {
          historyDeleteCandidate: item,
        })}
        formatHistoryDate={() => "2026-07-10"}
        selectionDisabled={false}
        selectionDisabledReason=""
        deletionDisabled={false}
        deletionDisabledReason=""
      />,
    );

    expect(markup).toContain('aria-label="确认永久删除历史任务"');
    expect(markup).toContain("视频、音频、文字稿、AI 结果和播放缓存");
    expect(markup).toContain("无法恢复");
    expect(markup.indexOf(">取消<")).toBeLessThan(markup.indexOf(">永久删除<"));
  });
});
