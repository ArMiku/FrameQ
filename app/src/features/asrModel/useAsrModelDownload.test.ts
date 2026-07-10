import { beforeEach, describe, expect, test, vi } from "vitest";

type StateUpdater<T> = T | ((current: T) => T);

type HookHarness = {
  resetRender: () => void;
  useCallback: <T extends (...args: never[]) => unknown>(callback: T) => T;
  useEffect: () => void;
  useRef: <T>(initialValue: T) => { current: T };
  useState: <T>(initialValue: T | (() => T)) => [T, (next: StateUpdater<T>) => void];
};

const listenMock = vi.fn();
const cancelAsrModelDownloadMock = vi.fn();
const checkFirstRunMock = vi.fn();
const downloadAsrModelMock = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

vi.mock("../../settingsClient", () => ({
  ASR_MODEL_DOWNLOAD_PROGRESS_EVENT: "asr-model-download-progress",
  cancelAsrModelDownload: cancelAsrModelDownloadMock,
  checkFirstRun: checkFirstRunMock,
  downloadAsrModel: downloadAsrModelMock,
}));

function createHookHarness(): HookHarness {
  const states: unknown[] = [];
  let cursor = 0;
  return {
    resetRender: () => {
      cursor = 0;
    },
    useCallback: (callback) => callback,
    useEffect: () => undefined,
    useRef: <T,>(initialValue: T) => {
      const stateIndex = cursor;
      cursor += 1;
      if (states.length <= stateIndex) {
        states[stateIndex] = { current: initialValue };
      }
      return states[stateIndex] as { current: T };
    },
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

function requireResolver<T>(resolver: ((value: T) => void) | null): (value: T) => void {
  if (!resolver) {
    throw new Error("Expected deferred operation resolver.");
  }
  return resolver;
}

async function createModelDownloadHook() {
  const harness = createHookHarness();
  vi.doMock("react", () => ({
    useCallback: harness.useCallback,
    useEffect: harness.useEffect,
    useRef: harness.useRef,
    useState: harness.useState,
  }));
  const { useAsrModelDownload } = await import("./useAsrModelDownload");
  return () => {
    harness.resetRender();
    return useAsrModelDownload();
  };
}

describe("useAsrModelDownload cancellation", () => {
  beforeEach(() => {
    vi.resetModules();
    listenMock.mockReset();
    cancelAsrModelDownloadMock.mockReset();
    checkFirstRunMock.mockReset();
    downloadAsrModelMock.mockReset();
  });

  test("restores the running model download after tree termination fails", async () => {
    listenMock.mockResolvedValue(() => undefined);
    downloadAsrModelMock.mockImplementation(() => new Promise(() => undefined));
    cancelAsrModelDownloadMock.mockResolvedValue({
      status: "failed",
      error: "tree termination failed",
    });
    const render = await createModelDownloadHook();

    let hook = render();
    void hook.startAsrModelDownload();
    await Promise.resolve();
    hook = render();
    expect(hook.modelDownloadProgress.status).toBe("started");

    await hook.cancelCurrentAsrModelDownload();
    hook = render();

    expect(cancelAsrModelDownloadMock).toHaveBeenCalledTimes(1);
    expect(hook.modelDownloadProgress.status).toBe("started");
    expect(hook.modelDownloadProgress.message).toContain("tree termination failed");
    expect(hook.modelDownloadActive).toBe(true);
  });

  test("shows cancelling until the model worker confirms cancellation", async () => {
    let resolveDownload: ((value: { started: false; status: "cancelled" }) => void) | null = null;
    listenMock.mockResolvedValue(() => undefined);
    downloadAsrModelMock.mockImplementation(
      () =>
        new Promise<{ started: false; status: "cancelled" }>((resolve) => {
          resolveDownload = resolve;
        }),
    );
    cancelAsrModelDownloadMock.mockResolvedValue({ status: "cancelling" });
    const render = await createModelDownloadHook();

    let hook = render();
    const download = hook.startAsrModelDownload();
    await Promise.resolve();
    hook = render();
    await hook.cancelCurrentAsrModelDownload();
    hook = render();
    expect(hook.modelDownloadProgress.status).toBe("cancelling");
    expect(hook.modelDownloadActive).toBe(true);

    requireResolver<{ started: false; status: "cancelled" }>(resolveDownload)({
      started: false,
      status: "cancelled",
    });
    await download;
    hook = render();

    expect(hook.modelDownloadProgress.status).toBe("cancelled");
    expect(hook.modelDownloadActive).toBe(false);
  });
});
