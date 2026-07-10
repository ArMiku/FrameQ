import type { Insight } from "./insightPreferences";

export type WorkflowStage =
  | "waiting_input"
  | "video_extracting"
  | "video_transcribing"
  | "insights_generating"
  | "completed"
  | "partial_completed"
  | "failed";

export type ProgressStepState = "pending" | "active" | "complete";

export type ProgressStep = {
  id: WorkflowStage;
  label: string;
  state: ProgressStepState;
};
export type TaskArtifactKey =
  | "video"
  | "audio"
  | "transcript_txt"
  | "transcript_md"
  | "segments"
  | "summary"
  | "mindmap"
  | "insights"
  | "insights_md"
  | "preference_snapshot";

export type TaskArtifacts = Partial<Record<TaskArtifactKey, string>>;

export type TranscriptMetadata = {
  source: "asr" | "subtitle";
  language: string | null;
  engine: string | null;
};

export type WorkerResult = {
  status: "completed" | "partial_completed" | "failed";
  task_id: string | null;
  task_dir: string | null;
  artifacts: TaskArtifacts;
  text: string;
  summary: string;
  insights: Insight[];
  transcript: TranscriptMetadata | null;
  error: WorkerErrorResult | null;
};

export type WorkerErrorResult = {
  code: string;
  message: string;
  stage: WorkflowStage;
};

export type WorkerProgressEvent = {
  stage: WorkflowStage;
  message: string;
  progress: number;
};

export type InsightRetryTarget = "summary" | "insights";

export type ToolbarNewTaskButtonState = {
  disabled: boolean;
  ariaLabel: string;
  title: string;
};

export type WorkflowState = {
  stage: WorkflowStage;
  url: string;
  submittedUrl: string;
  showUrlInput: boolean;
  statusMessage: string;
  progressPercent: number;
  text: string;
  summary: string;
  insights: Insight[];
  taskId: string | null;
  taskDir: string | null;
  artifacts: TaskArtifacts;
  transcript: TranscriptMetadata | null;
  error: WorkerErrorResult | null;
};
const PROGRESS_STEP_LABELS: Array<Pick<ProgressStep, "id" | "label">> = [
  { id: "video_extracting", label: "视频提取中" },
  { id: "video_transcribing", label: "视频转译中" },
  { id: "insights_generating", label: "AI 整理中" },
];
export function createInitialWorkflow(): WorkflowState {
  return {
    stage: "waiting_input",
    url: "",
    submittedUrl: "",
    showUrlInput: true,
    statusMessage: "",
    progressPercent: 0,
    text: "",
    summary: "",
    insights: [],
    taskId: null,
    taskDir: null,
    artifacts: {},
    transcript: null,
    error: null,
  };
}
export function startProcessing(state: WorkflowState, url: string): WorkflowState {
  return {
    ...state,
    stage: "video_extracting",
    url,
    submittedUrl: url,
    showUrlInput: false,
    statusMessage: "正在下载视频并准备媒体文件。",
    progressPercent: 12,
    text: "",
    summary: "",
    insights: [],
    taskId: null,
    taskDir: null,
    artifacts: {},
    error: null,
  };
}

export function startInsightRetry(state: WorkflowState, target: InsightRetryTarget): WorkflowState {
  return {
    ...state,
    stage: "insights_generating",
    showUrlInput: false,
    statusMessage:
      target === "summary"
        ? "正在生成要点总结和 Mermaid mindmap；文字稿片段会发送到管理员配置的云端 LLM 服务。"
        : "正在生成启发灵感；文字稿片段和本次偏好会发送到管理员配置的云端 LLM 服务。",
    progressPercent: 88,
    error: null,
  };
}

export function cancelProcessing(state: WorkflowState): WorkflowState {
  return {
    ...createInitialWorkflow(),
    url: state.submittedUrl || state.url,
  };
}

export function getProgressSteps(state: WorkflowState): ProgressStep[] {
  const activeIndex = PROGRESS_STEP_LABELS.findIndex((step) => step.id === state.stage);

  return PROGRESS_STEP_LABELS.map((step, index) => {
    if (state.stage === "completed" || state.stage === "partial_completed") {
      return { ...step, state: "complete" };
    }

    if (activeIndex === -1) {
      return { ...step, state: "pending" };
    }

    if (index < activeIndex) {
      return { ...step, state: "complete" };
    }

    return { ...step, state: index === activeIndex ? "active" : "pending" };
  });
}

export function isProcessingStage(stage: WorkflowStage): boolean {
  return (
    stage === "video_extracting" ||
    stage === "video_transcribing" ||
    stage === "insights_generating"
  );
}

export function getToolbarNewTaskButtonState(stage: WorkflowStage): ToolbarNewTaskButtonState {
  if (isProcessingStage(stage)) {
    return {
      disabled: true,
      ariaLabel: "处理中不可开始新任务，请先取消或等待完成",
      title: "处理中不可开始新任务，请先取消或等待完成",
    };
  }

  return {
    disabled: false,
    ariaLabel: "开始新任务",
    title: "开始新任务",
  };
}
export function getVisibleWorkflowError(state: WorkflowState): WorkerErrorResult | null {
  if (!state.error) {
    return null;
  }

  return state.stage === "failed" || state.stage === "partial_completed" ? state.error : null;
}

export function summarizeWorkerResult(result: WorkerResult): WorkflowState {
  return {
    ...createInitialWorkflow(),
    stage: result.status,
    showUrlInput: false,
    statusMessage: "",
    progressPercent: result.status === "failed" ? 35 : 100,
    text: result.text,
    summary: result.summary,
    insights: result.insights,
    taskId: result.task_id,
    taskDir: result.task_dir,
    artifacts: result.artifacts ?? {},
    transcript: result.transcript ?? null,
    error: result.error,
  };
}

export function getTranscriptSourceLabel(state: WorkflowState): string | null {
  if (!state.transcript) {
    return null;
  }
  if (state.transcript.source === "subtitle") {
    return `来源：平台字幕${state.transcript.language ? `（${state.transcript.language}）` : ""}`;
  }
  return "来源：本地 ASR";
}

export function mergeProgressEvent(
  state: WorkflowState,
  event: WorkerProgressEvent,
): WorkflowState {
  return {
    ...state,
    stage: event.stage,
    showUrlInput: false,
    statusMessage: event.message,
    progressPercent: Math.max(0, Math.min(100, event.progress)),
  };
}
