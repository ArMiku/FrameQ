from __future__ import annotations

from pathlib import Path

from frameq_worker.asr import (
    DEFAULT_ASR_MODEL,
    ASRError,
    QwenAsrTranscriber,
    Transcriber,
    transcribe_and_write,
)
from frameq_worker.insightflow import (
    InsightClient,
    InsightGenerationError,
    generate_insights_from_markdown,
)
from frameq_worker.models import JobStage, ProcessResult, WorkerError


def run_asr_transcript_step(
    audio_path: Path,
    output_dir: Path,
    output_stem: str,
    transcriber: Transcriber | None = None,
    model: str = DEFAULT_ASR_MODEL,
    source_url: str | None = None,
) -> ProcessResult:
    asr = transcriber or QwenAsrTranscriber(model_name=model)

    try:
        artifacts = transcribe_and_write(
            audio_path=audio_path,
            output_dir=output_dir,
            output_stem=output_stem,
            transcriber=asr,
            model=model,
            source_url=source_url,
        )
    except ASRError as exc:
        return ProcessResult(
            status=JobStage.FAILED,
            error=WorkerError(
                code=exc.code,
                message=str(exc),
                stage=JobStage.VIDEO_TRANSCRIBING,
            ),
        )

    return ProcessResult(
        status=JobStage.VIDEO_TRANSCRIBING,
        transcript_path=artifacts.txt_path.as_posix(),
        text=artifacts.text,
    )


def run_insight_generation_step(
    transcript_path: Path,
    output_dir: Path,
    output_stem: str,
    transcript_text: str,
    client: InsightClient | None,
) -> ProcessResult:
    if client is None:
        return ProcessResult(
            status=JobStage.PARTIAL_COMPLETED,
            transcript_path=transcript_path.as_posix(),
            text=transcript_text,
            error=WorkerError(
                code="INSIGHTFLOW_CONFIG_MISSING",
                message="InsightFlow LLM client is not configured.",
                stage=JobStage.INSIGHTS_GENERATING,
            ),
        )

    try:
        artifacts = generate_insights_from_markdown(
            markdown=transcript_path.read_text(encoding="utf-8"),
            output_dir=output_dir,
            output_stem=output_stem,
            client=client,
        )
    except InsightGenerationError as exc:
        return ProcessResult(
            status=JobStage.PARTIAL_COMPLETED,
            transcript_path=transcript_path.as_posix(),
            text=transcript_text,
            error=WorkerError(
                code=exc.code,
                message=str(exc),
                stage=JobStage.INSIGHTS_GENERATING,
            ),
        )

    return ProcessResult(
        status=JobStage.COMPLETED,
        transcript_path=transcript_path.as_posix(),
        insights_path=artifacts.json_path.as_posix(),
        text=transcript_text,
        insights=[insight.text for insight in artifacts.insights],
    )
