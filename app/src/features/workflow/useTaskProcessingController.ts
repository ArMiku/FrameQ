import { type FormEvent, useCallback, useMemo, useRef, useState } from "react";

import type { AccountStatus } from "../../accountState";
import { canGenerateAiWithAccount, canProcessWithAccount } from "../../accountState";
import {
  canSubmitUrl,
  cancelProcessing,
  createInitialWorkflow,
  getProgressSteps,
  getResultCards,
  getToolbarNewTaskButtonState,
  getVisibleWorkflowError,
  mergeProgressEvent,
  normalizeSubmitUrl,
  startInsightRetry,
  startProcessing,
  summarizeWorkerResult,
  type InsightRetryTarget,
} from "../../workflow";
import { cancelProcess, processVideo, retryInsights } from "../../workerClient";
import type { PreferenceSnapshot } from "../../insightPreferences";

type OpenAccountPanel = (notice?: string) => void;

type UseTaskProcessingControllerOptions = {
  onResetTaskUi: () => void;
  onRetryStarted: () => void;
  processBlockerMessage: (account: AccountStatus, actionLabel: string) => string;
  aiBlockerMessage: (account: AccountStatus, actionLabel: string) => string;
};

export function useTaskProcessingController({
  onResetTaskUi,
  onRetryStarted,
  processBlockerMessage,
  aiBlockerMessage,
}: UseTaskProcessingControllerOptions) {
  const [workflow, setWorkflow] = useState(createInitialWorkflow);
  const operationIdRef = useRef(0);

  const canSubmit = canSubmitUrl(workflow.url);
  const progressSteps = useMemo(() => getProgressSteps(workflow), [workflow]);
  const resultCards = useMemo(() => getResultCards(workflow), [workflow]);
  const visibleWorkflowError = getVisibleWorkflowError(workflow);
  const toolbarNewTaskButtonState = getToolbarNewTaskButtonState(workflow.stage);

  const resetWorkflow = useCallback(() => {
    operationIdRef.current += 1;
    onResetTaskUi();
    setWorkflow(createInitialWorkflow());
  }, [onResetTaskUi]);

  const startNewTaskFromToolbar = useCallback(() => {
    if (toolbarNewTaskButtonState.disabled) {
      return;
    }

    resetWorkflow();
  }, [resetWorkflow, toolbarNewTaskButtonState.disabled]);

  const submitUrl = useCallback(
    async (
      event: FormEvent<HTMLFormElement>,
      account: AccountStatus,
      openAccountPanel: OpenAccountPanel,
    ) => {
      event.preventDefault();
      if (!canSubmit) {
        return;
      }
      if (!canProcessWithAccount(account)) {
        openAccountPanel(processBlockerMessage(account, "开始新任务"));
        return;
      }
      const submittedUrl = normalizeSubmitUrl(workflow.url);
      if (!submittedUrl) {
        return;
      }
      const operationId = operationIdRef.current + 1;
      operationIdRef.current = operationId;
      setWorkflow((current) => startProcessing(current, submittedUrl));
      const result = await processVideo(submittedUrl, undefined, (event) => {
        if (operationIdRef.current === operationId) {
          setWorkflow((current) => mergeProgressEvent(current, event));
        }
      });
      if (operationIdRef.current !== operationId) {
        return;
      }
      setWorkflow((current) => ({
        ...summarizeWorkerResult(result),
        url: submittedUrl,
        submittedUrl: current.submittedUrl || submittedUrl,
      }));
    },
    [canSubmit, processBlockerMessage, workflow.url],
  );

  const cancelCurrentProcessing = useCallback(async () => {
    operationIdRef.current += 1;
    onResetTaskUi();
    setWorkflow((current) => cancelProcessing(current));
    await cancelProcess();
  }, [onResetTaskUi]);

  const retryInsightGeneration = useCallback(
    async (
      target: InsightRetryTarget,
      preferenceSnapshot: PreferenceSnapshot | null,
      account: AccountStatus,
      openAccountPanel: OpenAccountPanel,
      onRetryCompleted?: () => void,
    ) => {
      if (!workflow.taskId || !workflow.artifacts.transcript_txt) {
        return;
      }
      if (!canGenerateAiWithAccount(account)) {
        openAccountPanel(
          aiBlockerMessage(
            account,
            target === "summary" ? "生成要点总结" : "生成启发灵感",
          ),
        );
        return;
      }

      const taskId = workflow.taskId;
      const operationId = operationIdRef.current + 1;
      operationIdRef.current = operationId;
      onRetryStarted();
      setWorkflow((current) => startInsightRetry(current, target));

      const result = await retryInsights(taskId, target, preferenceSnapshot);
      if (operationIdRef.current !== operationId) {
        return;
      }
      setWorkflow((current) => ({
        ...summarizeWorkerResult({
          ...result,
          task_id: result.task_id ?? current.taskId,
          task_dir: result.task_dir ?? current.taskDir,
          artifacts: {
            ...current.artifacts,
            ...(result.artifacts ?? {}),
          },
          text: result.text || current.text,
          summary: result.summary || current.summary,
          insights: result.insights.length > 0 ? result.insights : current.insights,
        }),
        url: current.url,
        submittedUrl: current.submittedUrl,
      }));
      onRetryCompleted?.();
    },
    [aiBlockerMessage, onRetryStarted, workflow.artifacts.transcript_txt, workflow.taskId],
  );

  return {
    workflow,
    setWorkflow,
    canSubmit,
    progressSteps,
    resultCards,
    visibleWorkflowError,
    toolbarNewTaskButtonState,
    cancelCurrentProcessing,
    resetWorkflow,
    retryInsightGeneration,
    startNewTaskFromToolbar,
    submitUrl,
  };
}
