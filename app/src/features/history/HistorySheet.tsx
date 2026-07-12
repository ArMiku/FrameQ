import { Clock3, FileText, FolderOpen, Trash2, TriangleAlert, X } from "lucide-react";

import type { HistoryListItem } from "../../historyClient";
import type { HistoryController } from "./useHistoryController";

const historyStatusCopy: Record<HistoryListItem["status"], string> = {
  completed: "已完成",
  partial_completed: "部分完成",
  failed: "失败",
};

type HistorySheetProps = {
  controller: HistoryController;
  formatHistoryDate: (value: string) => string;
  selectionDisabled: boolean;
  selectionDisabledReason: string;
  deletionDisabled: boolean;
  deletionDisabledReason: string;
};

export function HistorySheet({
  controller,
  formatHistoryDate,
  selectionDisabled,
  selectionDisabledReason,
  deletionDisabled,
  deletionDisabledReason,
}: HistorySheetProps) {
  const {
    historyOpen,
    historyItems,
    historyNotice,
    historyLoading,
    historyDeleteCandidate,
    historyDeleting,
    closeHistory,
    openHistoryItem,
    requestHistoryItemDeletion,
    cancelHistoryItemDeletion,
    confirmHistoryItemDeletion,
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
        onKeyDown={(event) => {
          if (event.key === "Escape" && historyDeleteCandidate) {
            event.preventDefault();
            event.stopPropagation();
            cancelHistoryItemDeletion();
          }
        }}
      >
        <header className="modal-header sheet-header">
          <div>
            <p className="section-label">History</p>
            <h2>历史任务</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={closeHistory}
            aria-label="关闭历史"
            disabled={historyDeleting}
          >
            <X size={18} />
          </button>
        </header>
        {historyNotice ? <p className="action-notice">{historyNotice}</p> : null}
        {selectionDisabled ? (
          <p id="history-selection-disabled-reason" className="action-notice" role="status">
            {selectionDisabledReason}
          </p>
        ) : null}
        {deletionDisabled && (!selectionDisabled || deletionDisabledReason !== selectionDisabledReason) ? (
          <p id="history-deletion-disabled-reason" className="action-notice" role="status">
            {deletionDisabledReason}
          </p>
        ) : null}
        <div className="history-list">
          {historyItems.map((item) => (
            <div
              className={`history-item ${item.status}`}
              key={item.id}
            >
              <button
                className="history-item-select"
                type="button"
                onClick={() => openHistoryItem(item)}
                disabled={selectionDisabled || historyDeleting}
                aria-describedby={
                  selectionDisabled ? "history-selection-disabled-reason" : undefined
                }
              >
                <div className="history-item-main">
                  <span className={`history-status ${item.status}`}>
                    {historyStatusCopy[item.status]}
                  </span>
                  <strong
                    className={`history-title ${
                      item.textPreview ? "history-title-preview" : "history-title-url"
                    }`}
                    title={item.textPreview || item.url}
                  >
                    {item.textPreview || item.url}
                  </strong>
                </div>
                <div className="history-meta">
                  <span className="history-meta-time">
                    <Clock3 size={13} />
                    <span className="history-meta-value">{formatHistoryDate(item.createdAt)}</span>
                  </span>
                  <span className="history-meta-output" title={item.outputDir || "outputs"}>
                    <FolderOpen size={13} />
                    <span className="history-meta-value">{item.outputDir || "outputs"}</span>
                  </span>
                  <span
                    className="history-meta-result"
                    title={item.error ? item.error.code : `${item.insightsCount} 条灵感`}
                  >
                    <span className="history-meta-value">
                      {item.error ? item.error.code : `${item.insightsCount} 条灵感`}
                    </span>
                  </span>
                </div>
              </button>
              <button
                className="history-item-delete"
                type="button"
                onClick={() => requestHistoryItemDeletion(item)}
                disabled={deletionDisabled || historyDeleting}
                aria-label="永久删除此历史任务"
                title="永久删除"
                aria-describedby={
                  deletionDisabled
                    ? selectionDisabled && deletionDisabledReason === selectionDisabledReason
                      ? "history-selection-disabled-reason"
                      : "history-deletion-disabled-reason"
                    : undefined
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {!historyLoading && historyItems.length === 0 ? (
            <div className="history-empty">
              <FileText size={18} />
              <span>还没有可查看的历史任务。</span>
            </div>
          ) : null}
        </div>
        {historyDeleteCandidate ? (
          <div
            className="history-delete-confirm-backdrop"
            role="presentation"
            onClick={historyDeleting ? undefined : cancelHistoryItemDeletion}
          >
            <section
              className="history-delete-confirm"
              role="alertdialog"
              aria-modal="true"
              aria-label="确认永久删除历史任务"
              onClick={(event) => event.stopPropagation()}
            >
              <TriangleAlert size={22} />
              <div>
                <h3>永久删除此任务？</h3>
                <p>
                  将删除该任务的视频、音频、文字稿、AI 结果和播放缓存，并立即释放空间。此操作无法恢复。
                </p>
              </div>
              <div className="history-delete-confirm-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={cancelHistoryItemDeletion}
                  disabled={historyDeleting}
                  autoFocus
                >
                  取消
                </button>
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => void confirmHistoryItemDeletion()}
                  disabled={historyDeleting}
                >
                  {historyDeleting ? "正在永久删除" : "永久删除"}
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </div>
  );
}
