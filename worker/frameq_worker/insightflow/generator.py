from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Protocol

from frameq_worker.insightflow.prompt import build_question_prompt
from frameq_worker.insightflow.splitter import MarkdownSplitter
from frameq_worker.insightflow.utils import extract_json_from_llm_output


class InsightGenerationError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class InsightClient(Protocol):
    def generate(self, prompt: str) -> str:
        pass


@dataclass(frozen=True)
class Insight:
    id: int
    text: str
    label: str = ""
    chunk_id: int = 1


@dataclass(frozen=True)
class InsightArtifacts:
    insights: list[Insight]
    json_path: Path
    md_path: Path


def generate_insights_from_markdown(
    markdown: str,
    output_dir: Path,
    output_stem: str,
    client: InsightClient,
    splitter: MarkdownSplitter | None = None,
) -> InsightArtifacts:
    chunks = (splitter or MarkdownSplitter()).split(markdown)
    if not chunks:
        raise InsightGenerationError("INSIGHTFLOW_EMPTY_TRANSCRIPT", "Transcript is empty.")

    insights: list[Insight] = []
    seen: set[str] = set()
    for chunk in chunks:
        number = max(1, min(5, len(chunk.content) // 500 + 1))
        prompt = build_question_prompt(chunk.content, number=number)
        parsed = extract_json_from_llm_output(client.generate(prompt))
        questions = _normalize_questions(parsed)
        for question in questions:
            if question not in seen:
                seen.add(question)
                insights.append(Insight(id=len(insights) + 1, text=question, chunk_id=chunk.id))

    return write_insight_files(insights, output_dir=output_dir, output_stem=output_stem)


def write_insight_files(
    insights: list[Insight],
    output_dir: Path,
    output_stem: str,
) -> InsightArtifacts:
    if not insights:
        raise InsightGenerationError(
            "INSIGHTFLOW_EMPTY_RESULT",
            "InsightFlow returned no insights.",
        )

    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / f"{output_stem}_insights.json"
    md_path = output_dir / f"{output_stem}_insights.md"

    payload = {
        "file_id": output_stem,
        "insights": [asdict(insight) for insight in insights],
    }
    json_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    md_path.write_text(_format_insights_markdown(insights), encoding="utf-8")

    return InsightArtifacts(insights=insights, json_path=json_path, md_path=md_path)


def _normalize_questions(parsed: object | None) -> list[str]:
    if not isinstance(parsed, list):
        return []

    questions: list[str] = []
    for item in parsed:
        if isinstance(item, str):
            text = item.strip()
        elif isinstance(item, dict):
            text = str(item.get("question") or item.get("text") or "").strip()
        else:
            text = ""
        if text:
            questions.append(text)
    return questions


def _format_insights_markdown(insights: list[Insight]) -> str:
    lines = ["# 启发话题点", ""]
    for insight in insights:
        lines.append(f"{insight.id}. {insight.text}")
    lines.append("")
    return "\n".join(lines)
