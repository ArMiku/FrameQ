import { beforeEach, describe, expect, test, vi } from "vitest";
import type { HistoryItem } from "../../historyClient";
import type { HistoryController } from "./useHistoryController";

type StateUpdater<T> = T | ((current: T) => T);

type HookHarness = {
  resetRender: () => void;
  useCallback: <T extends (...args: never[]) => unknown>(callback: T) => T;
  useState: <T>(initialValue: T | (() => T)) => [T, (next: StateUpdater<T>) => void];
};

const getHistoryMock = vi.fn<() => Promise<HistoryItem[]>>();

vi.mock("../../historyClient", () => ({
  getHistory: getHistoryMock,
}));

function createHookHarness(): HookHarness {
  const states: unknown[] = [];
  let cursor = 0;

  return {
    resetRender: () => {
      cursor = 0;
    },
    useCallback: (callback) => callback,
    useState: <T,>(initialValue: T | (() => T)) => {
      const stateIndex = cursor;
      cursor += 1;
      if (states.length <= stateIndex) {
        states[stateIndex] =
          typeof initialValue === "function"
            ? (initialValue as () => T)()
            : initialValue;
      }
      const setState = (next: StateUpdater<T>) => {
        states[stateIndex] =
          typeof next === "function"
            ? (next as (current: T) => T)(states[stateIndex] as T)
            : next;
      };
      return [states[stateIndex] as T, setState];
    },
  };
}

function createHistoryItem(overrides: Partial<HistoryItem> = {}): HistoryItem {
  return {
    taskId: "task-1",
    id: "task-1",
    createdAt: "2026-07-09T00:00:00.000Z",
    url: "https://example.test/video",
    status: "completed",
    taskDir: "D:/FrameQ/tasks/task-1",
    outputDir: "D:/FrameQ/outputs",
    artifacts: { transcript_txt: "transcript/transcript.txt" },
    error: null,
    textPreview: "demo transcript",
    insightsCount: 0,
    text: "demo transcript body",
    summary: "",
    transcript: null,
    insights: [],
    ...overrides,
  };
}

async function createController(
  onHistoryItemSelected = vi.fn(),
): Promise<{
  render: () => HistoryController;
  onHistoryItemSelected: typeof onHistoryItemSelected;
}> {
  const harness = createHookHarness();
  vi.doMock("react", () => ({
    useCallback: harness.useCallback,
    useState: harness.useState,
  }));
  const { useHistoryController } = await import("./useHistoryController");

  return {
    render: () => {
      harness.resetRender();
      return useHistoryController({ onHistoryItemSelected });
    },
    onHistoryItemSelected,
  };
}

describe("useHistoryController", () => {
  beforeEach(() => {
    vi.resetModules();
    getHistoryMock.mockReset();
  });

  test("opens history and loads items", async () => {
    const item = createHistoryItem();
    getHistoryMock.mockResolvedValueOnce([item]);
    const { render } = await createController();

    let controller = render();
    expect(controller.historyOpen).toBe(false);
    expect(controller.historyLoading).toBe(false);

    const load = controller.openHistory();
    controller = render();
    expect(controller.historyOpen).toBe(true);
    expect(controller.historyLoading).toBe(true);
    expect(controller.historyItems).toEqual([]);
    expect(controller.historyNotice).not.toBe("");

    await load;
    controller = render();
    expect(getHistoryMock).toHaveBeenCalledTimes(1);
    expect(controller.historyOpen).toBe(true);
    expect(controller.historyLoading).toBe(false);
    expect(controller.historyItems).toEqual([item]);
    expect(controller.historyNotice).toBe("");
  });

  test("shows an empty notice when history has no items", async () => {
    getHistoryMock.mockResolvedValueOnce([]);
    const { render } = await createController();

    let controller = render();
    await controller.openHistory();
    controller = render();

    expect(controller.historyOpen).toBe(true);
    expect(controller.historyLoading).toBe(false);
    expect(controller.historyItems).toEqual([]);
    expect(controller.historyNotice).not.toBe("");
  });

  test("keeps the sheet open and surfaces load errors", async () => {
    getHistoryMock.mockRejectedValueOnce(new Error("disk unavailable"));
    const { render } = await createController();

    let controller = render();
    await controller.openHistory();
    controller = render();

    expect(controller.historyOpen).toBe(true);
    expect(controller.historyLoading).toBe(false);
    expect(controller.historyItems).toEqual([]);
    expect(controller.historyNotice).toContain("disk unavailable");
  });

  test("selects a history item and closes the sheet", async () => {
    const item = createHistoryItem({ id: "selected-task" });
    getHistoryMock.mockResolvedValueOnce([item]);
    const { render, onHistoryItemSelected } = await createController();

    let controller = render();
    await controller.openHistory();
    controller = render();
    expect(controller.historyOpen).toBe(true);

    controller.openHistoryItem(item);
    controller = render();

    expect(onHistoryItemSelected).toHaveBeenCalledWith(item);
    expect(controller.historyOpen).toBe(false);
  });
});
