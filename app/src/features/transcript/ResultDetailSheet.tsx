import {
  CheckCircle2,
  Copy,
  Download,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  X,
} from "lucide-react";

import { clampAudioTime, formatAudioClock } from "../../audioReviewBarState";
import { isTranscriptSegmentEditDisabled } from "../../transcriptReviewState";
import type { WorkflowState } from "../../workflow";
import { MarkdownContent } from "../results/MarkdownContent";
import type { TranscriptDetailController } from "./useTranscriptDetailController";

type ResultDetailSheetProps = {
  actionNotice: string;
  controller: TranscriptDetailController;
  workflow: WorkflowState;
  onOpenDirectionEditorFromDetail: () => void | Promise<void>;
};

function formatSegmentTime(startMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(startMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function ResultDetailSheet({
  actionNotice,
  controller,
  workflow,
  onOpenDirectionEditorFromDetail,
}: ResultDetailSheetProps) {
  const {
    detailTab,
    openDetailTab,
    closeDetail,
    detailTitle,
    detailText,
    exportPath,
    transcriptDetail,
    transcriptDraft,
    transcriptSegments,
    transcriptDirty,
    transcriptLoading,
    transcriptSaving,
    activeTranscriptSegmentId,
    editingTranscriptSegmentId,
    transcriptAudioCurrentTime,
    transcriptAudioDuration,
    transcriptAudioPlaying,
    transcriptAudioRef,
    transcriptSegmentRefs,
    transcriptSourceLabel,
    transcriptAudioSrc,
    transcriptAudioProgress,
    transcriptAudioScrubberMax,
    transcriptAudioScrubberStyle,
    hasTranscriptSegments,
    copyDetail,
    exportDetail,
    saveTranscriptDraft,
    playTranscriptSegment,
    handleTranscriptAudioMetadata,
    handleTranscriptTimeUpdate,
    handleTranscriptAudioPlay,
    handleTranscriptAudioPause,
    toggleTranscriptAudio,
    scrubTranscriptAudio,
    beginTranscriptSegmentEdit,
    updateTranscriptSegmentDraft,
    updateFullTranscriptDraft,
  } = controller;

  if (!detailTab) {
    return null;
  }

  return (
    <div className="modal-backdrop sheet-backdrop" role="presentation" onClick={closeDetail}>
      <section
        className="sheet-panel detail-modal detail-sheet"
        aria-label="结果详情"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header sheet-header">
          <div>
            <p className="section-label">Preview</p>
            <h2>{detailTitle}</h2>
          </div>
          <button className="icon-button" type="button" onClick={closeDetail} aria-label="关闭详情">
            <X size={18} />
          </button>
        </header>
        <div className="tabs">
          <button
            className={detailTab === "summary" ? "selected" : ""}
            type="button"
            onClick={() => openDetailTab("summary")}
          >
            要点总结
          </button>
          <button
            className={detailTab === "insights" ? "selected" : ""}
            type="button"
            onClick={() => openDetailTab("insights")}
          >
            启发灵感
          </button>
          <button
            className={detailTab === "transcript" ? "selected" : ""}
            type="button"
            onClick={() => openDetailTab("transcript")}
          >
            完整文字稿
          </button>
        </div>
        <div className="modal-tools">
          <div className="detail-tool-status">
            {detailTab === "transcript" ? (
              <span>
                {transcriptDirty
                  ? "有未保存修改"
                  : transcriptDetail?.has_original_backup
                    ? "已创建原始备份"
                    : "本地文字稿"}
              </span>
            ) : (
              <span>本地结果预览</span>
            )}
          </div>
          <div className="tool-actions">
            <button type="button" onClick={copyDetail} disabled={!detailText}>
              <Copy size={16} />
              <span>复制</span>
            </button>
            {detailTab === "transcript" ? (
              <button
                type="button"
                onClick={saveTranscriptDraft}
                disabled={!workflow.taskId || !workflow.artifacts.transcript_txt || !transcriptDirty || transcriptSaving}
              >
                {transcriptSaving ? <LoaderCircle size={16} className="spin" /> : <CheckCircle2 size={16} />}
                <span>{transcriptSaving ? "保存中" : "保存"}</span>
              </button>
            ) : null}
            {detailTab === "insights" ? (
              <button
                type="button"
                onClick={() => void onOpenDirectionEditorFromDetail()}
                disabled={!workflow.taskId || !workflow.artifacts.transcript_txt}
              >
                <RotateCcw size={16} />
                <span>换个方向</span>
              </button>
            ) : null}
            <button type="button" onClick={exportDetail} disabled={!exportPath}>
              <Download size={16} />
              <span>导出</span>
            </button>
          </div>
        </div>
        {actionNotice ? <p className="action-notice">{actionNotice}</p> : null}
        <div className="modal-content">
          {detailTab === "summary" ? (
            <MarkdownContent markdown={workflow.summary} emptyText="要点总结生成后将在这里显示。" />
          ) : detailTab === "insights" ? (
            workflow.insights.length > 0 ? (
              <ol className="insight-detail-list">
                {workflow.insights.map((insight) => (
                  <li className="insight-detail-item" key={insight.id}>
                    <h3>{insight.topic}</h3>
                    <dl>
                      <div>
                        <dt>匹配理由</dt>
                        <dd>{insight.matchReason}</dd>
                      </div>
                      <div>
                        <dt>启发问题</dt>
                        <dd>{insight.followUpQuestions.join("；")}</dd>
                      </div>
                      <div>
                        <dt>适合用途</dt>
                        <dd>{insight.suitableUse}</dd>
                      </div>
                      {insight.sourceChunkId === null ? null : (
                        <div>
                          <dt>来源片段</dt>
                          <dd>{insight.sourceChunkId}</dd>
                        </div>
                      )}
                    </dl>
                  </li>
                ))}
              </ol>
            ) : (
              <p>启发灵感尚未生成。</p>
            )
          ) : (
            <div className="transcript-review">
              {transcriptSourceLabel ? (
                <p className="transcript-source">{transcriptSourceLabel}</p>
              ) : null}
              {transcriptLoading ? (
                <p className="transcript-status">正在读取文字稿详情...</p>
              ) : null}
              {transcriptAudioSrc ? (
                <>
                  <audio
                    ref={transcriptAudioRef}
                    className="transcript-audio-engine"
                    src={transcriptAudioSrc}
                    preload="metadata"
                    onLoadedMetadata={handleTranscriptAudioMetadata}
                    onDurationChange={handleTranscriptAudioMetadata}
                    onTimeUpdate={handleTranscriptTimeUpdate}
                    onPlay={handleTranscriptAudioPlay}
                    onPause={handleTranscriptAudioPause}
                    onEnded={handleTranscriptAudioPause}
                  />
                  <div className="audio-review-bar" aria-label="音频回听工具条">
                    <button
                      className="audio-play-button"
                      type="button"
                      onClick={() => void toggleTranscriptAudio()}
                      aria-label={transcriptAudioPlaying ? "暂停音频" : "播放音频"}
                    >
                      {transcriptAudioPlaying ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                    <div className="audio-review-timeline">
                      <input
                        className="audio-review-scrubber"
                        type="range"
                        min={0}
                        max={transcriptAudioScrubberMax}
                        step={0.1}
                        style={transcriptAudioScrubberStyle}
                        value={clampAudioTime(transcriptAudioCurrentTime, transcriptAudioScrubberMax)}
                        onChange={scrubTranscriptAudio}
                        disabled={transcriptAudioDuration <= 0}
                        aria-label="音频进度"
                        aria-valuetext={`${formatAudioClock(transcriptAudioCurrentTime)}，${Math.round(
                          transcriptAudioProgress,
                        )}%`}
                      />
                      <div className="audio-review-clock">
                        <span>{formatAudioClock(transcriptAudioCurrentTime)}</span>
                        <span aria-hidden="true"> / </span>
                        <span>{formatAudioClock(transcriptAudioDuration)}</span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <p className="transcript-status">当前任务没有可播放的本地音频。</p>
              )}
              {hasTranscriptSegments ? (
                <div className="transcript-segments">
                  {transcriptSegments.map((segment) => (
                    <div
                      key={segment.id}
                      ref={(element) => {
                        transcriptSegmentRefs.current[segment.id] = element;
                      }}
                      className={`transcript-segment ${
                        activeTranscriptSegmentId === segment.id ? "active" : ""
                      } ${editingTranscriptSegmentId === segment.id ? "editing" : ""}`}
                    >
                      <div className="transcript-segment-header">
                        <button
                          type="button"
                          className="transcript-segment-time"
                          onClick={() => void playTranscriptSegment(segment)}
                          disabled={!transcriptDetail?.audio_asset_path || Boolean(editingTranscriptSegmentId)}
                        >
                          <Play size={14} />
                          <span>{formatSegmentTime(segment.start_ms)}</span>
                        </button>
                        <button
                          type="button"
                          className="secondary-button compact-button"
                          onClick={() => beginTranscriptSegmentEdit(segment.id)}
                          disabled={isTranscriptSegmentEditDisabled(editingTranscriptSegmentId, segment.id)}
                        >
                          编辑
                        </button>
                      </div>
                      {editingTranscriptSegmentId === segment.id ? (
                        <textarea
                          value={segment.text}
                          onChange={(event) =>
                            updateTranscriptSegmentDraft(segment.id, event.currentTarget.value)
                          }
                          autoFocus
                        />
                      ) : (
                        <button
                          type="button"
                          className="transcript-segment-text"
                          onClick={() => void playTranscriptSegment(segment)}
                        >
                          {segment.text}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <textarea
                  className="transcript-full-editor"
                  value={transcriptDraft}
                  onFocus={() => beginTranscriptSegmentEdit("full-text")}
                  onChange={(event) => updateFullTranscriptDraft(event.currentTarget.value)}
                  placeholder="文字稿生成后将在这里显示。"
                />
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
