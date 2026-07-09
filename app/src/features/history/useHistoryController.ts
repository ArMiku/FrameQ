import { useCallback, useState } from "react";

import { getHistory, type HistoryItem } from "../../historyClient";

type UseHistoryControllerOptions = {
  onHistoryItemSelected: (item: HistoryItem) => void;
};

export function useHistoryController({
  onHistoryItemSelected,
}: UseHistoryControllerOptions) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyNotice, setHistoryNotice] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);

  const closeHistory = useCallback(() => {
    setHistoryOpen(false);
  }, []);

  const openHistory = useCallback(async () => {
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
    (item: HistoryItem) => {
      onHistoryItemSelected(item);
      setHistoryOpen(false);
    },
    [onHistoryItemSelected],
  );

  return {
    historyOpen,
    historyItems,
    historyNotice,
    historyLoading,
    closeHistory,
    openHistory,
    openHistoryItem,
  };
}

export type HistoryController = ReturnType<typeof useHistoryController>;
