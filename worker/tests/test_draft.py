from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest
from frameq_worker import draft_agent
from frameq_worker.draft_agent import _build_system_prompt
from frameq_worker.task_store import TaskPaths
from frameq_worker.worker_service import generate_draft_once


def _payload(task_id: str = "20260709-120000-douyin-demo", **overrides) -> str:
    data = {
        "task_id": task_id,
        "topic": "如何把长视频拆成短视频",
        "summary": "# 要点总结\n- 要点一\n- 要点二",
        "target_platform": "xiaohongshu",
    }
    data.update(overrides)
    return json.dumps(data, ensure_ascii=False)


def _static_runner(text: str):
    """同签名 fake draft_runner：记录调用、返回定值文本（隔离真实 LLM / anysearch）。"""

    def runner(topic, summary, platform, env):
        runner.calls.append((topic, summary, platform))
        return text

    runner.calls = []
    return runner


def test_generate_draft_once_writes_draft_and_returns_aligned_result(tmp_path: Path) -> None:
    runner = _static_runner("# 稿子标题\n\n正文内容")

    result = generate_draft_once(
        _payload(),
        project_root=tmp_path,
        environ={},
        draft_runner=runner,
    )

    task_dir = tmp_path / "outputs" / "tasks" / "20260709-120000-douyin-demo"
    assert result == {
        "status": "completed",
        "task_id": "20260709-120000-douyin-demo",
        "task_dir": task_dir.as_posix(),
        "draft_path": "ai/draft.md",
        "draft_text": "# 稿子标题\n\n正文内容",
        "error": None,
    }
    # 落盘内容与 draft_text 字面一致；ai/ 按需创建
    assert (task_dir / "ai" / "draft.md").read_text(encoding="utf-8") == "# 稿子标题\n\n正文内容"
    # 解析后的 topic / platform 透传给 runner
    assert runner.calls[0][:2] == ("如何把长视频拆成短视频", "# 要点总结\n- 要点一\n- 要点二")
    assert runner.calls[0][2] == "xiaohongshu"


def test_generate_draft_once_returns_invalid_json_error(tmp_path: Path) -> None:
    result = generate_draft_once(
        "{not valid json",
        project_root=tmp_path,
        environ={},
        draft_runner=_static_runner("x"),
    )

    assert result["status"] == "failed"
    assert result["error"] == {
        "code": "INVALID_DRAFT_JSON",
        "message": "Draft payload must be valid JSON.",
        "stage": "draft_generating",
    }
    assert result["draft_path"] is None
    assert result["task_id"] is None
    assert result["task_dir"] is None


def test_generate_draft_once_returns_invalid_payload_error(tmp_path: Path) -> None:
    result = generate_draft_once(
        json.dumps({"task_id": "20260709-120000-douyin-demo", "topic": "t"}),
        project_root=tmp_path,
        environ={},
        draft_runner=_static_runner("x"),
    )

    assert result["status"] == "failed"
    assert result["error"]["code"] == "INVALID_DRAFT_PAYLOAD"
    assert result["error"]["stage"] == "draft_generating"
    assert result["draft_path"] is None


def test_generate_draft_once_wraps_runner_exception(tmp_path: Path) -> None:
    def boom(topic, summary, platform, env):
        raise RuntimeError("missing FRAMEQ_LLM_API_KEY")

    result = generate_draft_once(
        _payload(),
        project_root=tmp_path,
        environ={},
        draft_runner=boom,
    )

    assert result["status"] == "failed"
    assert result["error"]["code"] == "DRAFT_GENERATION_FAILED"
    assert "missing FRAMEQ_LLM_API_KEY" in result["error"]["message"]
    assert result["error"]["stage"] == "draft_generating"
    # 解析阶段已成功 → task_id / task_dir 仍回填；产物路径置 null；不落盘
    assert result["task_id"] == "20260709-120000-douyin-demo"
    assert result["task_dir"] is not None
    assert result["draft_path"] is None
    assert not (
        tmp_path / "outputs" / "tasks" / "20260709-120000-douyin-demo" / "ai" / "draft.md"
    ).exists()


@pytest.mark.parametrize("empty_text", ["", "   ", "\n\t  \n"])
def test_generate_draft_once_treats_empty_result_as_failed_without_writing(
    tmp_path: Path,
    empty_text: str,
) -> None:
    result = generate_draft_once(
        _payload(task_id="20260709-120001-douyin-emp"),
        project_root=tmp_path,
        environ={},
        draft_runner=_static_runner(empty_text),
    )

    assert result["status"] == "failed"
    assert result["error"]["code"] == "DRAFT_EMPTY_RESULT"
    assert result["error"]["stage"] == "draft_generating"
    assert result["draft_path"] is None
    assert result["draft_text"] == ""
    # 解析已成功 → task_id 回填；空稿子不落盘
    assert result["task_id"] == "20260709-120001-douyin-emp"
    assert result["task_dir"] is not None
    assert not (
        tmp_path / "outputs" / "tasks" / "20260709-120001-douyin-emp" / "ai" / "draft.md"
    ).exists()


def test_task_paths_draft_path_points_at_ai_draft_md(tmp_path: Path) -> None:
    paths = TaskPaths(output_root=tmp_path, cache_root=tmp_path / "cache", task_id="t1")

    assert paths.draft_path == tmp_path / "tasks" / "t1" / "ai" / "draft.md"


@pytest.mark.parametrize(
    "platform",
    ["douyin", "xiaohongshu", "totally_unknown_platform_123", "wechat_channels", "podcast"],
)
def test_build_system_prompt_slot_fills_any_platform_without_dict_residue(platform: str) -> None:
    # 平台文体非后端职责（design D4）：阶段 0 占位字典已删，任意平台 id 槽位填充、不报错，
    # 无平台专属文体内容残留。
    assert not hasattr(draft_agent, "PLATFORM_PROMPTS")
    assert not hasattr(draft_agent, "_DEFAULT_PLATFORM_PROMPT")

    prompt = _build_system_prompt(platform)
    assert f"目标平台：{platform}" in prompt
    assert "小红书" not in prompt
    assert "微博" not in prompt
    assert "吸睛标题" not in prompt


def test_draft_sink_starts_empty_and_writes_non_empty() -> None:
    sink = draft_agent.DraftSink()
    assert sink.value == ""
    assert sink.set("# 标题\n\n正文")
    assert sink.value == "# 标题\n\n正文"


@pytest.mark.parametrize("blank", ["", "   ", "\n\t  \n"])
def test_draft_sink_ignores_blank_without_overwriting(blank: str) -> None:
    # 既有非空提交不被空白覆盖
    sink = draft_agent.DraftSink()
    sink.set("既有非空正文")
    assert sink.set(blank) is False
    assert sink.value == "既有非空正文"

    # 全程空白 → value 恒为 ""
    empty_sink = draft_agent.DraftSink()
    assert empty_sink.set(blank) is False
    assert empty_sink.value == ""


def test_draft_sink_keeps_last_non_empty_on_multiple_calls() -> None:
    sink = draft_agent.DraftSink()
    sink.set("第一版")
    sink.set("   ")  # 空白不覆盖
    sink.set("第二版")
    assert sink.value == "第二版"


def test_submit_draft_tool_writes_non_empty_into_shared_sink() -> None:
    sink = draft_agent.DraftSink()
    tool = draft_agent._build_submit_draft_tool(sink)
    # submit_draft 工具并入工具集（与 planning 开关正交）：handler 是 sink 的唯一写入面。
    assert tool.name == "submit_draft"

    ok = asyncio.run(tool.handler(None, markdown="# 完整稿子\n\n正文"))
    assert sink.value == "# 完整稿子\n\n正文"
    assert "结束" in ok


def test_submit_draft_tool_rejects_blank_without_overwriting() -> None:
    sink = draft_agent.DraftSink()
    sink.set("既有正文")
    tool = draft_agent._build_submit_draft_tool(sink)

    rejected = asyncio.run(tool.handler(None, markdown="   "))
    assert sink.value == "既有正文"
    assert rejected.strip()  # 返回非空提示，而非静默丢弃


def test_build_system_prompt_states_submit_draft_contract_and_neutralizes_skill_paradigm() -> None:
    # system 层权威于 skill 层（design D5）：硬性契约 + 中和 chatbot 范式。
    prompt = _build_system_prompt("xiaohongshu")
    assert "submit_draft" in prompt
    assert "禁止" in prompt and "普通回复" in prompt
    # 中和 viral-writer 的「向用户确认需求」与「保存为文件」chatbot 步骤
    assert "不向用户确认" in prompt
    assert "不" in prompt and "保存为文件" in prompt
