import { Clock3, FileText, FolderOpen, X } from "lucide-react";

import type { HistoryItem } from "../../historyClient";
import type { HistoryController } from "./useHistoryController";

const historyStatusCopy: Record<HistoryItem["status"], string> = {
  completed: "已完成",
  partial_completed: "部分完成",
  failed: "失败",
};

type HistorySheetProps = {
  controller: HistoryController;
  formatHistoryDate: (value: string) => string;
  selectionDisabled: boolean;
  selectionDisabledReason: string;
};

export function HistorySheet({
  controller,
  formatHistoryDate,
  selectionDisabled,
  selectionDisabledReason,
}: HistorySheetProps) {
  const {
    historyOpen,
    historyItems,
    historyNotice,
    historyLoading,
    closeHistory,
    openHistoryItem,
  } = controller;

  if (!historyOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop sheet-backdrop" role="presentation" onClick={closeHistory}>
      <section
        className="sheet-panel detail-modal history-modal history-sheet"
        aria-label="历史任务"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header sheet-header">
          <div>
            <p className="section-label">History</p>
            <h2>历史任务</h2>
          </div>
          <button className="icon-button" type="button" onClick={closeHistory} aria-label="关闭历史">
            <X size={18} />
          </button>
        </header>
        {historyNotice ? <p className="action-notice">{historyNotice}</p> : null}
        {selectionDisabled ? (
          <p id="history-selection-disabled-reason" className="action-notice" role="status">
            {selectionDisabledReason}
          </p>
        ) : null}
        <div className="history-list">
          {historyItems.map((item) => (
            <button
              className={`history-item ${item.status}`}
              key={item.id}
              type="button"
              onClick={() => openHistoryItem(item)}
              disabled={selectionDisabled}
              aria-describedby={
                selectionDisabled ? "history-selection-disabled-reason" : undefined
              }
            >
              <div className="history-item-main">
                <span className={`history-status ${item.status}`}>
                  {historyStatusCopy[item.status]}
                </span>
                <strong>{item.textPreview || item.url}</strong>
              </div>
              <div className="history-meta">
                <span>
                  <Clock3 size={13} />
                  {formatHistoryDate(item.createdAt)}
                </span>
                <span>
                  <FolderOpen size={13} />
                  {item.outputDir || "outputs"}
                </span>
                <span>{item.error ? item.error.code : `${item.insightsCount} 条灵感`}</span>
              </div>
            </button>
          ))}
          {!historyLoading && historyItems.length === 0 ? (
            <div className="history-empty">
              <FileText size={18} />
              <span>还没有可查看的历史任务。</span>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
