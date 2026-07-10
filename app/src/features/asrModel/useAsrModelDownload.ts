import { useCallback, useEffect, useRef, useState } from "react";
import { listen, type Event } from "@tauri-apps/api/event";

import { isModelDownloadStalled, shouldApplyModelDownloadUpdate } from "../../modelDownloadState";
import {
  ASR_MODEL_DOWNLOAD_PROGRESS_EVENT,
  cancelAsrModelDownload,
  checkFirstRun,
  downloadAsrModel,
  type AsrModelDownloadProgress,
  type FirstRunStatus,
} from "../../settingsClient";
import type { AsrModelStatus } from "./types";

const defaultAsrModelStatus: AsrModelStatus = {
  model: "iic/SenseVoiceSmall",
  modelDir: "",
  available: false,
  source: "modelscope",
};

export function useAsrModelDownload() {
  const [modelGuideOpen, setModelGuideOpen] = useState(false);
  const [asrModelStatus, setAsrModelStatus] = useState<AsrModelStatus>(defaultAsrModelStatus);
  const [modelDownloadProgress, setModelDownloadProgress] = useState<AsrModelDownloadProgress>({
    status: "idle",
    message: "",
    progress: 0,
  });
  const [modelDownloadNotice, setModelDownloadNotice] = useState("");
  const [modelDownloadStalled, setModelDownloadStalled] = useState(false);
  const modelDownloadOperationIdRef = useRef(0);
  const modelDownloadPhaseRef = useRef<"running" | "cancelling" | "finished">("finished");
  const modelDownloadProgressBeforeCancellationRef = useRef<AsrModelDownloadProgress | null>(null);
  const modelDownloadProgressUpdatedAtRef = useRef(Date.now());
  const modelDownloadActive = ["started", "downloading", "extracting", "cancelling"].includes(
    modelDownloadProgress.status,
  );

  useEffect(() => {
    if (!modelDownloadActive) {
      setModelDownloadStalled(false);
      return;
    }

    const interval = window.setInterval(() => {
      setModelDownloadStalled(
        isModelDownloadStalled({
          active: true,
          lastProgressAtMs: modelDownloadProgressUpdatedAtRef.current,
          nowMs: Date.now(),
        }),
      );
    }, 5_000);

    return () => window.clearInterval(interval);
  }, [modelDownloadActive]);

  const updateAsrModelStatus = useCallback((status: FirstRunStatus) => {
    setAsrModelStatus({
      model: status.asrModel,
      modelDir: status.asrModelDir,
      available: status.asrModelAvailable,
      source: status.asrModelSource,
    });
  }, []);

  const refreshAsrModelStatus = useCallback(async (): Promise<FirstRunStatus> => {
    const status = await checkFirstRun();
    updateAsrModelStatus(status);
    return status;
  }, [updateAsrModelStatus]);

  async function startAsrModelDownload() {
    if (modelDownloadActive) {
      return;
    }

    const operationId = modelDownloadOperationIdRef.current + 1;
    modelDownloadOperationIdRef.current = operationId;
    modelDownloadPhaseRef.current = "running";
    modelDownloadProgressBeforeCancellationRef.current = null;
    setModelGuideOpen(true);
    setModelDownloadNotice("");
    setModelDownloadStalled(false);
    modelDownloadProgressUpdatedAtRef.current = Date.now();
    setModelDownloadProgress({
      status: "started",
      message: "正在准备下载 ASR 模型。",
      progress: 0,
    });

    let unlisten: (() => void) | null = null;
    try {
      unlisten = await listen(ASR_MODEL_DOWNLOAD_PROGRESS_EVENT, (event: Event<unknown>) => {
        const progress = parseAsrModelDownloadProgress(event.payload);
        if (
          progress &&
          shouldApplyModelDownloadUpdate({
            operationId,
            activeOperationId: modelDownloadOperationIdRef.current,
            phase: modelDownloadPhaseRef.current,
          })
        ) {
          modelDownloadProgressUpdatedAtRef.current = Date.now();
          setModelDownloadStalled(false);
          setModelDownloadProgress(progress);
        }
      });

      const downloadResult = await downloadAsrModel();
      if (
        !shouldApplyModelDownloadUpdate({
          operationId,
          activeOperationId: modelDownloadOperationIdRef.current,
          phase: modelDownloadPhaseRef.current,
        })
      ) {
        return;
      }
      if (downloadResult.status === "cancelled") {
        modelDownloadPhaseRef.current = "finished";
        setModelDownloadStalled(false);
        setModelDownloadProgress({
          status: "cancelled",
          message: "模型下载已取消。",
          progress: 0,
        });
        setModelDownloadNotice("模型下载已取消。已下载的模型文件会保留以便下次继续。 ");
        return;
      }
      const status = await refreshAsrModelStatus();
      if (
        !shouldApplyModelDownloadUpdate({
          operationId,
          activeOperationId: modelDownloadOperationIdRef.current,
          phase: modelDownloadPhaseRef.current,
        })
      ) {
        return;
      }
      modelDownloadPhaseRef.current = "finished";
      if (status.asrModelAvailable) {
        setModelDownloadStalled(false);
        setModelDownloadProgress({
          status: "completed",
          message: "ASR 模型已下载完成。",
          progress: 100,
        });
        setModelDownloadNotice("ASR 模型已可用，后续转写会使用本地缓存。");
      } else {
        setModelDownloadStalled(false);
        setModelDownloadProgress((current) => ({
          status: "failed",
          message: "模型下载未完成。",
          progress: current.progress,
        }));
        setModelDownloadNotice("模型下载未完成，请稍后重试。");
      }
    } catch (error) {
      if (
        !shouldApplyModelDownloadUpdate({
          operationId,
          activeOperationId: modelDownloadOperationIdRef.current,
          phase: modelDownloadPhaseRef.current,
        })
      ) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      modelDownloadPhaseRef.current = "finished";
      setModelDownloadStalled(false);
      setModelDownloadProgress((current) => ({
        status: "failed",
        message,
        progress: current.progress,
      }));
      setModelDownloadNotice(`下载失败：${message}`);
    } finally {
      if (unlisten) {
        unlisten();
      }
    }
  }

  async function cancelCurrentAsrModelDownload() {
    const operationId = modelDownloadOperationIdRef.current;
    if (modelDownloadPhaseRef.current !== "running") {
      return;
    }

    modelDownloadPhaseRef.current = "cancelling";
    setModelDownloadProgress((current) => {
      modelDownloadProgressBeforeCancellationRef.current = current;
      return {
        status: "cancelling",
        message: "正在取消模型下载，请等待当前进程结束。",
        progress: current.progress,
      };
    });
    setModelDownloadStalled(false);
    setModelDownloadNotice("正在取消模型下载，请等待当前进程结束。");
    try {
      const result = await cancelAsrModelDownload();
      if (operationId !== modelDownloadOperationIdRef.current) {
        return;
      }
      if (result.status === "failed") {
        modelDownloadPhaseRef.current = "running";
        const previous = modelDownloadProgressBeforeCancellationRef.current;
        setModelDownloadProgress(
          previous
            ? { ...previous, message: `取消失败：${result.error || "无法终止下载进程。"}` }
            : {
                status: "downloading",
                message: `取消失败：${result.error || "无法终止下载进程。"}`,
                progress: 0,
              },
        );
        setModelDownloadNotice(`取消失败：${result.error || "无法终止下载进程。"}`);
        return;
      }
      setModelDownloadNotice(
        result.status === "not_running"
          ? "下载已接近结束，正在等待最终结果。"
          : "正在取消模型下载，请等待当前进程结束。",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (operationId !== modelDownloadOperationIdRef.current) {
        return;
      }
      modelDownloadPhaseRef.current = "running";
      const previous = modelDownloadProgressBeforeCancellationRef.current;
      if (previous) {
        setModelDownloadProgress({ ...previous, message: `取消失败：${message}` });
      }
      setModelDownloadStalled(false);
      setModelDownloadNotice(`取消失败：${message}`);
    }
  }

  const openModelGuide = useCallback((notice?: string) => {
    setModelGuideOpen(true);
    if (notice !== undefined) {
      setModelDownloadNotice(notice);
    }
  }, []);

  return {
    modelGuideOpen,
    setModelGuideOpen,
    openModelGuide,
    asrModelStatus,
    modelDownloadProgress,
    modelDownloadNotice,
    modelDownloadStalled,
    modelDownloadActive,
    refreshAsrModelStatus,
    startAsrModelDownload,
    cancelCurrentAsrModelDownload,
  };
}

function parseAsrModelDownloadProgress(payload: unknown): AsrModelDownloadProgress | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const event = payload as Partial<AsrModelDownloadProgress>;
  if (
    typeof event.status !== "string" ||
    typeof event.message !== "string" ||
    typeof event.progress !== "number"
  ) {
    return null;
  }

  return {
    status: event.status,
    message: event.message,
    progress: Math.max(0, Math.min(100, event.progress)),
    currentFile:
      typeof event.currentFile === "string"
        ? event.currentFile
        : typeof (event as { current_file?: unknown }).current_file === "string"
          ? (event as { current_file: string }).current_file
          : undefined,
  };
}
