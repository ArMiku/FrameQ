import json
from pathlib import Path

from frameq_worker.insightflow import (
    Insight,
    InsightGenerationError,
    MarkdownSplitter,
    generate_insights_from_markdown,
    write_insight_files,
)


class FakeInsightClient:
    def __init__(self) -> None:
        self.prompts: list[str] = []

    def generate(self, prompt: str) -> str:
        self.prompts.append(prompt)
        return json.dumps(
            [
                "企业级 AI 落地时，什么能力才是真正的价值分水岭？",
                "为什么流程编排可能比单点模型能力更关键？",
            ],
            ensure_ascii=False,
        )


def test_markdown_splitter_preserves_heading_context() -> None:
    chunks = MarkdownSplitter(max_length=80).split(
        "# 总标题\n\n第一段内容。\n\n## 子标题\n\n第二段内容。" * 4
    )

    assert chunks
    assert chunks[0].content
    assert chunks[0].summary


def test_generate_insights_from_markdown_writes_json_and_markdown(tmp_path: Path) -> None:
    transcript = "# 视频文字稿\n\n这里是企业 AI 落地与流程编排相关的完整文字稿。"
    client = FakeInsightClient()

    artifacts = generate_insights_from_markdown(
        markdown=transcript,
        output_dir=tmp_path / "outputs",
        output_stem="demo",
        client=client,
    )

    assert [insight.text for insight in artifacts.insights] == [
        "企业级 AI 落地时，什么能力才是真正的价值分水岭？",
        "为什么流程编排可能比单点模型能力更关键？",
    ]
    assert artifacts.json_path.exists()
    assert artifacts.md_path.exists()
    assert json.loads(artifacts.json_path.read_text(encoding="utf-8")) == {
        "file_id": "demo",
        "insights": [
            {
                "id": 1,
                "text": "企业级 AI 落地时，什么能力才是真正的价值分水岭？",
                "label": "",
                "chunk_id": 1,
            },
            {
                "id": 2,
                "text": "为什么流程编排可能比单点模型能力更关键？",
                "label": "",
                "chunk_id": 1,
            },
        ],
    }
    assert "启发话题点" in artifacts.md_path.read_text(encoding="utf-8")
    assert "阅读思考伙伴和议题策展者" in client.prompts[0]


def test_write_insight_files_rejects_empty_insights(tmp_path: Path) -> None:
    try:
        write_insight_files([], output_dir=tmp_path / "outputs", output_stem="demo")
    except InsightGenerationError as error:
        assert error.code == "INSIGHTFLOW_EMPTY_RESULT"
    else:
        raise AssertionError("Expected InsightGenerationError")


def test_write_insight_files_serializes_existing_insights(tmp_path: Path) -> None:
    artifacts = write_insight_files(
        [Insight(id=1, text="为什么流程编排可能比单点模型能力更关键？", chunk_id=12)],
        output_dir=tmp_path / "outputs",
        output_stem="demo",
    )

    assert artifacts.json_path.read_text(encoding="utf-8")
    assert artifacts.md_path.read_text(encoding="utf-8")
