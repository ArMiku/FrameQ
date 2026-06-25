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
        if "Mermaid mindmap" in prompt:
            return "mindmap\n  root((流程编排))\n    上下文能力"
        if "根据文字稿原文和 Mermaid 思维导图" in prompt:
            return "# 要点总结\n\n## 总览\n流程编排和上下文能力共同影响 AI 落地。"
        if "话题分段规划师" in prompt:
            return (
                '[{"title":"流程编排","summary":"流程编排影响 AI 落地",'
                '"excerpt":"流程编排和上下文能力共同影响 AI 落地。","question_count":1}]'
            )
        return '["为什么流程编排可能比单点模型能力更关键？"]'


class SummaryOnlyClient:
    def generate(self, prompt: str) -> str:
        if "Mermaid mindmap" in prompt:
            return "mindmap\n  root((总结成功))"
        if "根据文字稿原文和 Mermaid 思维导图" in prompt:
            return "# 要点总结\n\n## 总览\n总结已生成。"
        if "话题分段规划师" in prompt:
            return "not json"
        return "not json"


class InsightsOnlyClient:
    def generate(self, prompt: str) -> str:
        if "Mermaid mindmap" in prompt:
            return "graph TD\n  A-->B"
        if "话题分段规划师" in prompt:
            return (
                '[{"title":"话题","summary":"话题摘要",'
                '"excerpt":"话题原文片段","question_count":1}]'
            )
        return '["为什么成功的一侧结果应该被保留？"]'


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
    assert serialized["summary"] == (
        "# 要点总结\n\n## 总览\n流程编排和上下文能力共同影响 AI 落地。\n"
    )
    assert serialized["summary_path"] == (tmp_path / "outputs" / "demo_summary.md").as_posix()
    assert serialized["mindmap_path"] == (tmp_path / "outputs" / "demo_mindmap.mmd").as_posix()
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


def test_run_insight_generation_step_preserves_summary_when_insights_fail(
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
        client=SummaryOnlyClient(),
    ).to_dict()

    assert result["status"] == "partial_completed"
    assert result["summary_path"] == (tmp_path / "outputs" / "demo_summary.md").as_posix()
    assert result["mindmap_path"] == (tmp_path / "outputs" / "demo_mindmap.mmd").as_posix()
    assert result["insights_path"] is None
    assert result["error"]["code"] == "INSIGHTFLOW_EMPTY_RESULT"


def test_run_insight_generation_step_preserves_insights_when_summary_fails(
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
        client=InsightsOnlyClient(),
    ).to_dict()

    assert result["status"] == "partial_completed"
    assert result["summary_path"] is None
    assert result["mindmap_path"] is None
    assert result["insights_path"] == (tmp_path / "outputs" / "demo_insights.json").as_posix()
    assert result["insights"] == ["为什么成功的一侧结果应该被保留？"]
    assert result["error"]["code"] == "INSIGHTFLOW_INVALID_MINDMAP"
