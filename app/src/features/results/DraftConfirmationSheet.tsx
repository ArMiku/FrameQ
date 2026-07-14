import { FileText, ShieldCheck, Sprout, X } from "lucide-react";

import type { WorkflowState } from "../../workflow";

type DraftConfirmationSheetProps = {
  open: boolean;
  workflow: WorkflowState;
  busy: boolean;
  quotaRemaining: number;
  transcriptPath: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * 6.3: the `生成文字稿` confirmation sheet. Simpler than the insights wizard —
 * no profile/preferences, just the selected seed summary + a fixed-1 quota
 * notice + the data privacy notice + confirm/cancel.
 *
 * The quota notice shows a FIXED 1: one draft generation attempt costs
 * exactly one quota unit, independent of success; a retry counts separately.
 * The data notice reuses the existing AI privacy copy (no web-search /
 * anysearch disclosure is added).
 */
export function DraftConfirmationSheet({
  open,
  workflow,
  busy,
  quotaRemaining,
  transcriptPath,
  onConfirm,
  onCancel,
}: DraftConfirmationSheetProps) {
  if (!open) {
    return null;
  }

  const seed = workflow.insights.find(
    (insight) => insight.id === workflow.draftSeedInsightId,
  );

  return (
    <div className="modal-backdrop sheet-backdrop" role="presentation" onClick={onCancel}>
      <section
        className="sheet-panel detail-modal preference-flow-sheet"
        aria-label="确认生成文字稿"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header sheet-header">
          <div>
            <p className="section-label">Draft</p>
            <h2>确认生成文字稿</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onCancel}
            aria-label="关闭生成文字稿确认"
          >
            <X size={18} />
          </button>
        </header>
        <div className="preference-flow-content">
          <p className="settings-warning privacy-callout">
            <ShieldCheck size={16} />
            <span>
              确认后仅发送文字稿片段，视频和音频不会上传。
            </span>
          </p>
          <section className="preference-summary-group">
            <h3>文字稿种子</h3>
            <div className="preference-summary-list">
              {seed ? (
                <span>
                  <Sprout size={15} aria-hidden="true" />
                  #{seed.id} {seed.topic}
                </span>
              ) : (
                <span>未选择种子</span>
              )}
            </div>
          </section>
          <div className="confirm-summary preference-confirm-grid">
            <div>
              <span className="account-status-label">本次额度</span>
              <strong>1 次额度</strong>
              <small>1 次额度 = 1 次生成尝试，不论成败，重试另计</small>
            </div>
            <div>
              <span className="account-status-label">AI Credits</span>
              <strong>余额 {quotaRemaining}</strong>
              <small>{transcriptPath || "文字稿文件生成后才能继续。"}</small>
            </div>
          </div>
          <div className="settings-actions sheet-footer">
            <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>
              <span>取消</span>
            </button>
            <button type="button" className="primary-button" onClick={onConfirm} disabled={busy}>
              <FileText size={16} />
              <span>{busy ? "启动中" : "确认"}</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
