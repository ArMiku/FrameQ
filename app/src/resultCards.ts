import type { Insight } from "./insightPreferences";
import type { InsightRetryTarget, TaskArtifactKey, WorkflowState } from "./workflowState";

export type ResultCard = {
  id: "video" | "audio" | "insights" | "summary" | "transcript";
  title: string;
  status: "ready" | "pending" | "failed";
  action: "open" | "locate" | "confirm";
};

export type DetailTab = ResultCard["id"];
export function getResultCards(state: WorkflowState): ResultCard[] {
  const mediaCards: ResultCard[] = [
    hasArtifact(state, "video")
      ? {
          id: "video",
          title: "视频文件",
          status: "ready",
          action: "locate",
        }
      : null,
    hasArtifact(state, "audio")
      ? {
          id: "audio",
          title: "音频文件",
          status: "ready",
          action: "locate",
        }
      : null,
  ].filter((card): card is ResultCard => card !== null);

  const transcriptCard: ResultCard | null =
    hasArtifact(state, "transcript_txt") || state.text
      ? {
          id: "transcript",
          title: "完整文字稿",
          status: "ready",
          action: "open",
        }
      : null;
  const summaryCard: ResultCard =
    hasArtifact(state, "summary") || state.summary
      ? {
          id: "summary",
          title: "要点总结",
          status: "ready",
          action: "open",
        }
      : {
          id: "summary",
          title: "要点总结",
          status: state.stage === "partial_completed" ? "failed" : "pending",
          action: "confirm",
        };
  const insightsCard: ResultCard =
    state.insights.length > 0 || hasArtifact(state, "insights") || hasArtifact(state, "insights_md")
      ? {
          id: "insights",
          title: "启发灵感",
          status: "ready",
          action: "open",
        }
      : {
          id: "insights",
          title: "启发灵感",
          status: state.stage === "partial_completed" ? "failed" : "pending",
          action: "confirm",
        };

  if (state.stage === "partial_completed") {
    return [
      ...mediaCards,
      ...(transcriptCard ? [transcriptCard] : []),
      summaryCard,
      insightsCard,
    ];
  }

  if (state.stage === "completed") {
    return [
      ...mediaCards,
      ...(transcriptCard ? [transcriptCard] : []),
      summaryCard,
      insightsCard,
    ];
  }

  if (state.stage === "failed") {
    return [...mediaCards, ...(transcriptCard ? [transcriptCard] : [])];
  }

  return [];
}

export function getInsightRetryTargetForCard(card: ResultCard): InsightRetryTarget | null {
  if (card.action !== "confirm") {
    return null;
  }
  if (card.id === "summary" || card.id === "insights") {
    return card.id;
  }
  return null;
}

export function getDetailText(tab: DetailTab, state: WorkflowState): string {
  if (tab === "transcript") {
    return state.text.trim();
  }

  if (tab === "summary") {
    return state.summary.trim();
  }

  if (tab === "insights") {
    return state.insights.map(formatInsightForCopy).join("\n\n");
  }

  return "";
}

function formatInsightForCopy(insight: Insight, index: number): string {
  return [
    `${index + 1}. ${insight.topic}`,
    `匹配理由：${insight.matchReason}`,
    `启发问题：${insight.followUpQuestions.join("；")}`,
    `适合用途：${insight.suitableUse}`,
    insight.sourceChunkId === null ? "" : `来源片段：${insight.sourceChunkId}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function getExportPath(tab: DetailTab, state: WorkflowState): string | null {
  if (tab === "video") {
    return getTaskArtifactPath(state, "video");
  }

  if (tab === "audio") {
    return getTaskArtifactPath(state, "audio");
  }

  if (tab === "transcript") {
    return getTaskArtifactPath(state, "transcript_txt");
  }

  if (tab === "summary") {
    return getTaskArtifactPath(state, "summary");
  }

  return getTaskArtifactPath(state, "insights_md") ?? getTaskArtifactPath(state, "insights");
}

export function hasArtifact(state: WorkflowState, key: TaskArtifactKey): boolean {
  return Boolean(state.taskDir && state.artifacts[key]);
}

export function getTaskArtifactPath(
  state: WorkflowState,
  key: TaskArtifactKey,
): string | null {
  const artifact = state.artifacts[key];
  if (!state.taskDir || !artifact) {
    return null;
  }
  return joinTaskArtifactPath(state.taskDir, artifact);
}

export function joinTaskArtifactPath(taskDir: string, artifact: string): string {
  const separator = taskDir.includes("\\") ? "\\" : "/";
  const normalizedTaskDir = taskDir.replace(/[\\/]+$/, "");
  const normalizedArtifact = artifact.replace(/^[\\/]+/, "").replace(/[\\/]+/g, separator);
  return `${normalizedTaskDir}${separator}${normalizedArtifact}`;
}
