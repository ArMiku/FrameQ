import { useCallback, useRef, useState } from "react";

import {
  deleteHistoryTask,
  getHistory,
  getHistoryDetail,
  type HistoryItem,
  type HistoryListItem,
} from "../../historyClient";

type UseHistoryControllerOptions = {
  onHistoryItemSelected: (item: HistoryItem) => void;
  onHistoryItemDeleted: (taskId: string) => void;
  onPrepareHistoryItemDeletion: (taskId: string) => void;
};

export function useHistoryController({
  onHistoryItemSelected,
  onHistoryItemDeleted,
  onPrepareHistoryItemDeletion,
}: UseHistoryControllerOptions) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<HistoryListItem[]>([]);
  const [historyNotice, setHistoryNotice] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDeleteCandidate, setHistoryDeleteCandidate] = useState<HistoryListItem | null>(null);
  const [historyDeleting, setHistoryDeleting] = useState(false);
  const detailRequestIdRef = useRef(0);
  const deleteRequestPendingRef = useRef(false);

  const closeHistory = useCallback(() => {
    detailRequestIdRef.current += 1;
    setHistoryOpen(false);
    if (!deleteRequestPendingRef.current) {
      setHistoryDeleteCandidate(null);
    }
  }, []);

  const openHistory = useCallback(async () => {
    detailRequestIdRef.current += 1;
    setHistoryDeleteCandidate(null);
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryItems([]);
    setHistoryNotice("正在读取历史记录。");
    try {
      const items = await getHistory();
      setHistoryItems(items);
      setHistoryNotice(items.length > 0 ? "" : "暂无历史任务。");
    } catch (error) {
      setHistoryNotice(`读取历史失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const openHistoryItem = useCallback(
    async (item: HistoryListItem) => {
      const requestId = detailRequestIdRef.current + 1;
      detailRequestIdRef.current = requestId;
      setHistoryLoading(true);
      setHistoryNotice("正在读取历史任务详情。");
      try {
        const detail = await getHistoryDetail(item.taskId);
        if (detailRequestIdRef.current !== requestId) {
          return;
        }
        onHistoryItemSelected(detail);
        setHistoryOpen(false);
        setHistoryNotice("");
      } catch (error) {
        if (detailRequestIdRef.current === requestId) {
          setHistoryNotice(
            `读取历史任务详情失败：${error instanceof Error ? error.message : String(error)}`,
          );
        }
      } finally {
        if (detailRequestIdRef.current === requestId) {
          setHistoryLoading(false);
        }
      }
    },
    [onHistoryItemSelected],
  );

  const requestHistoryItemDeletion = useCallback((item: HistoryListItem) => {
    detailRequestIdRef.current += 1;
    setHistoryDeleteCandidate(item);
    setHistoryNotice("");
  }, []);

  const cancelHistoryItemDeletion = useCallback(() => {
    if (!deleteRequestPendingRef.current) {
      setHistoryDeleteCandidate(null);
    }
  }, []);

  const confirmHistoryItemDeletion = useCallback(async () => {
    if (!historyDeleteCandidate || deleteRequestPendingRef.current) {
      return;
    }
    const taskId = historyDeleteCandidate.taskId;
    deleteRequestPendingRef.current = true;
    detailRequestIdRef.current += 1;
    setHistoryDeleting(true);
    setHistoryNotice("正在永久删除任务。");
    onPrepareHistoryItemDeletion(taskId);
    try {
      await deleteHistoryTask(taskId);
      setHistoryItems((current) => current.filter((item) => item.taskId !== taskId));
      setHistoryDeleteCandidate(null);
      setHistoryNotice("任务已永久删除。");
      onHistoryItemDeleted(taskId);
    } catch {
      try {
        setHistoryItems(await getHistory());
      } catch {
        // Keep the last safe list when the follow-up manifest projection is unavailable.
      }
      setHistoryNotice(
        "未能完整删除任务。部分文件可能仍被其他程序占用，请关闭相关文件后重试。",
      );
    } finally {
      deleteRequestPendingRef.current = false;
      setHistoryDeleting(false);
    }
  }, [
    historyDeleteCandidate,
    onHistoryItemDeleted,
    onPrepareHistoryItemDeletion,
  ]);

  return {
    historyOpen,
    historyItems,
    historyNotice,
    historyLoading,
    historyDeleteCandidate,
    historyDeleting,
    closeHistory,
    openHistory,
    openHistoryItem,
    requestHistoryItemDeletion,
    cancelHistoryItemDeletion,
    confirmHistoryItemDeletion,
  };
}

export type HistoryController = ReturnType<typeof useHistoryController>;
