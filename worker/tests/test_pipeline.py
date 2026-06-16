from pathlib import Path

from frameq_worker.asr import Transcript
from frameq_worker.pipeline import run_asr_transcript_step, run_insight_generation_step


class FakeTranscriber:
    def transcribe(self, audio_path: Path, language: str = "Chinese") -> Transcript:
        return Transcript(text="这是一段可用于后续 InsightFlow 的文字稿。", language=language)


def test_run_asr_transcript_step_returns_process_result_with_transcript_paths(
    tmp_path: Path,
) -> None:
    audio_path = tmp_path / "work" / "demo.wav"
    audio_path.parent.mkdir()
    audio_path.write_bytes(b"fake wav")

    result = run_asr_transcript_step(
        audio_path=audio_path,
        output_dir=tmp_path / "outputs",
        output_stem="demo",
        transcriber=FakeTranscriber(),
    )

    serialized = result.to_dict()

    assert serialized["status"] == "video_transcribing"
    assert serialized["text"] == "这是一段可用于后续 InsightFlow 的文字稿。"
    assert serialized["transcript_path"] == (
        tmp_path / "outputs" / "demo_transcript.txt"
    ).as_posix()
    assert (tmp_path / "outputs" / "demo_transcript.txt").read_text(encoding="utf-8").strip()
    assert (tmp_path / "outputs" / "demo_transcript.md").read_text(encoding="utf-8").strip()


def test_run_asr_transcript_step_maps_asr_errors_to_worker_error(tmp_path: Path) -> None:
    class EmptyTranscriber:
        def transcribe(self, audio_path: Path, language: str = "Chinese") -> Transcript:
            return Transcript(text=" ", language=language)

    audio_path = tmp_path / "work" / "demo.wav"
    audio_path.parent.mkdir()
    audio_path.write_bytes(b"fake wav")

    result = run_asr_transcript_step(
        audio_path=audio_path,
        output_dir=tmp_path / "outputs",
        output_stem="demo",
        transcriber=EmptyTranscriber(),
    )

    assert result.to_dict()["error"] == {
        "code": "ASR_EMPTY_TRANSCRIPT",
        "message": "ASR returned an empty transcript.",
        "stage": "video_transcribing",
    }


class FakeInsightClient:
    def generate(self, prompt: str) -> str:
        return '["为什么流程编排可能比单点模型能力更关键？"]'


def test_run_insight_generation_step_returns_completed_result(tmp_path: Path) -> None:
    transcript_path = tmp_path / "outputs" / "demo_transcript.md"
    transcript_path.parent.mkdir()
    transcript_path.write_text("# 视频文字稿\n\n这是一段文字稿。", encoding="utf-8")

    result = run_insight_generation_step(
        transcript_path=transcript_path,
        output_dir=tmp_path / "outputs",
        output_stem="demo",
        transcript_text="这是一段文字稿。",
        client=FakeInsightClient(),
    )

    serialized = result.to_dict()

    assert serialized["status"] == "completed"
    assert serialized["text"] == "这是一段文字稿。"
    assert serialized["insights"] == ["为什么流程编排可能比单点模型能力更关键？"]
    assert serialized["insights_path"] == (tmp_path / "outputs" / "demo_insights.json").as_posix()


def test_run_insight_generation_step_without_client_returns_partial_completed(
    tmp_path: Path,
) -> None:
    transcript_path = tmp_path / "outputs" / "demo_transcript.md"
    transcript_path.parent.mkdir()
    transcript_path.write_text("# 视频文字稿\n\n这是一段文字稿。", encoding="utf-8")

    result = run_insight_generation_step(
        transcript_path=transcript_path,
        output_dir=tmp_path / "outputs",
        output_stem="demo",
        transcript_text="这是一段文字稿。",
        client=None,
    )

    serialized = result.to_dict()

    assert serialized["status"] == "partial_completed"
    assert serialized["text"] == "这是一段文字稿。"
    assert serialized["error"] == {
        "code": "INSIGHTFLOW_CONFIG_MISSING",
        "message": "InsightFlow LLM client is not configured.",
        "stage": "insights_generating",
    }
