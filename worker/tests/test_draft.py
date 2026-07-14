from __future__ import annotations

import asyncio
from pathlib import Path
from unittest.mock import patch

import pytest
from frameq_worker import draft_agent
from frameq_worker.draft_agent import (
    _RETRIEVAL_FALLBACK_PHRASE,
    _build_system_prompt,
    _build_user_prompt,
)
from frameq_worker.insightflow.prompt import build_draft_from_inspiration_prompt
from frameq_worker.models import (
    GenerationPreferences,
    Insight,
    PreferenceLabelSnapshot,
    PreferenceSnapshot,
)
from frameq_worker.task_store import TaskPaths


def test_task_paths_draft_path_points_at_ai_draft_md(tmp_path: Path) -> None:
    paths = TaskPaths(output_root=tmp_path, cache_root=tmp_path / "cache", task_id="t1")

    assert paths.draft_path == tmp_path / "tasks" / "t1" / "ai" / "draft.md"


@pytest.mark.parametrize(
    "suitable_use",
    ["douyin", "xiaohongshu", "totally_unknown_platform_123", "wechat_channels", "podcast"],
)
def test_build_system_prompt_slot_fills_any_suitable_use_without_dict_residue(
    suitable_use: str,
) -> None:
    # 平台文体非后端职责（design D4）：任意 suitableUse 经槽位填充、不报错，无平台专属文体残留。
    # 平台现在来自 Insight.suitable_use（Task 1.2/1.3）。
    assert not hasattr(draft_agent, "PLATFORM_PROMPTS")
    assert not hasattr(draft_agent, "_DEFAULT_PLATFORM_PROMPT")

    insight = Insight(
        id=1,
        topic="t",
        match_reason="r",
        follow_up_questions=(),
        suitable_use=suitable_use,
        source_chunk_id=None,
    )
    prompt = _build_system_prompt(insight)
    # 未知 suitableUse 原样透传（D4 fallback）；已知取值映射到对外规范名。
    if suitable_use == "公众号":
        assert "目标平台：微信公众号" in prompt
    else:
        assert f"目标平台：{suitable_use}" in prompt
    assert "小红书" not in prompt or suitable_use == "xiaohongshu"
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
    insight = Insight(
        id=1,
        topic="t",
        match_reason="r",
        follow_up_questions=(),
        suitable_use="xiaohongshu",
        source_chunk_id=None,
    )
    prompt = _build_system_prompt(insight)
    assert "submit_draft" in prompt
    assert "禁止" in prompt and "普通回复" in prompt
    # 中和 viral-writer 的「向用户确认需求」与「保存为文件」chatbot 步骤
    assert "不向用户确认" in prompt
    assert "不" in prompt and "保存为文件" in prompt


# ===========================================================================
# Task 1.2 / 1.2b / 1.3: rewired seed — Insight + preference snapshot
# ===========================================================================


def _insight(
    *,
    topic: str = "企业级 Agent 和通用 AI 工具的价值分水岭是什么？",
    suitable_use: str = "公众号",
    follow_up_questions: tuple[str, ...] = (
        "上下文能力为何决定 Agent 上限？",
        "流程编排如何影响落地成本？",
    ),
    match_reason: str = "源自原视频对 Context/Orchestration 的核心判断",
    source_chunk_id: int | None = 7,
    id_: int = 3,
) -> Insight:
    return Insight(
        id=id_,
        topic=topic,
        match_reason=match_reason,
        follow_up_questions=follow_up_questions,
        suitable_use=suitable_use,
        source_chunk_id=source_chunk_id,
    )


def _snapshot() -> PreferenceSnapshot:
    return PreferenceSnapshot(
        profile=None,
        profile_skipped=False,
        generation_preferences=GenerationPreferences(
            goal="建立专业影响力",
            scenario="公众号长文",
            angles=("实操方法",),
            audience="B 端运营负责人",
            styles=("口语化",),
            avoid=("过度营销",),
        ),
        label_snapshot=PreferenceLabelSnapshot(profile=(), generation_preferences=()),
    )


# --- _build_system_prompt: copy rewrite (1.2b) + suitableUse→platform (1.3) ---


@pytest.mark.parametrize(
    "suitable_use, expected_platform_label",
    [
        ("抖音", "抖音"),
        ("小红书", "小红书"),
        ("公众号", "微信公众号"),  # 1.3 alignment
        ("视频号", "视频号"),
    ],
)
def test_build_system_prompt_threads_suitable_use_as_target_platform(
    suitable_use: str, expected_platform_label: str
) -> None:
    """1.3: 目标平台 comes from Insight.suitableUse; 公众号 ↔ 微信公众号."""
    prompt = _build_system_prompt(_insight(suitable_use=suitable_use), summary=None)
    assert expected_platform_label in prompt
    assert f"目标平台：{expected_platform_label}" in prompt


def test_build_system_prompt_copy_uses_linggan_not_huati_dian() -> None:
    """1.2b: 话题点 → 灵感."""
    prompt = _build_system_prompt(_insight(), summary=None)
    assert "灵感" in prompt
    assert "话题点" not in prompt


def test_build_system_prompt_summary_none_omits_summary_grounding_clause() -> None:
    """1.2b: summary 缺失时不提要点总结 as a dedicated grounding clause.
    Note: the canonical retrieval-fallback line 「…要点总结（若有）继续成稿」is the
    spec-mandated fixed string (1.2b) and intentionally carries （若有）to cover
    both cases — it is NOT a summary-specific mention and is allowed regardless."""
    prompt = _build_system_prompt(_insight(), summary=None)
    # No dedicated "要点总结作为可选 grounding" clause / HEAD reference when None.
    assert "辅以原视频要点总结" not in prompt
    assert "参考附带的要点总结" not in prompt
    # The one-shot line ("…均已给出") does NOT add a summary clause when None.
    assert "灵感 + 要点总结（若有）、目标平台均已给出" not in prompt
    # The canonical fallback is the spec-fixed phrase (asserted via the constant
    # so that "this exact string is mandated by spec" lives in production code).
    assert _RETRIEVAL_FALLBACK_PHRASE in prompt


def test_build_system_prompt_summary_present_marks_summary_as_optional_grounding() -> None:
    """1.2b: summary 在场时，措辞保留要点总结作为可选 grounding."""
    prompt = _build_system_prompt(_insight(), summary="# 要点总结\n- 要点")
    assert "要点总结" in prompt


@pytest.mark.parametrize("whitespace", ["   ", "\n\t  \n", "\t"])
def test_build_system_prompt_summary_whitespace_only_treated_as_absent(
    whitespace: str,
) -> None:
    """I-2 一致性：纯空白 summary 在系统侧与用户侧都被视为缺失。

    - 系统侧 ``_build_system_prompt`` 不应 emit「参考附带的要点总结…grounding」，
      也不应在一次性成稿那行拼接 ``+ 要点总结（若有）``——与 ``summary=None`` 同。
    - 用户侧 ``build_draft_from_inspiration_prompt`` 不应 emit「## 原视频要点总结」
      段——与 ``summary=None`` 同。
    以此编码「两侧共用同一在场语义」的修复。
    """
    insight = _insight()

    # 系统侧：空白 summary 与 None 行为一致。
    prompt_ws = _build_system_prompt(insight, whitespace)
    prompt_none = _build_system_prompt(insight, None)
    assert "参考附带的要点总结" not in prompt_ws
    assert "灵感 + 要点总结（若有）、目标平台均已给出" not in prompt_ws
    # 关键：两份系统 prompt 在 summary 处理上结构一致（均为缺失）。
    assert prompt_ws == prompt_none

    # 用户侧：空白 summary 同样不 emit summary 段。
    user_prompt_ws = build_draft_from_inspiration_prompt(insight, None, whitespace)
    user_prompt_none = build_draft_from_inspiration_prompt(insight, None, None)
    assert "## 原视频要点总结" not in user_prompt_ws
    assert user_prompt_ws == user_prompt_none


def test_build_system_prompt_retrieval_fallback_mentions_linggan_and_optional_summary() -> None:
    """1.2b fallback line: 「基于灵感 + 要点总结（若有）继续成稿」."""
    prompt_with = _build_system_prompt(_insight(), summary="# 要点总结\n- x")
    prompt_without = _build_system_prompt(_insight(), summary=None)
    # With summary: both灵感 and 要点总结（若有）appear in the fallback line.
    assert "灵感" in prompt_with and "要点总结" in prompt_with and "若有" in prompt_with
    # Without summary: fallback mentions 灵感 + (要点总结若有的可选措辞) — at minimum 灵感.
    assert "灵感" in prompt_without


# --- _build_user_prompt: delegates to build_draft_from_inspiration_prompt ---


def test_build_user_prompt_delegates_to_prompt_function() -> None:
    """1.2: _build_user_prompt consumes Insight + snapshot + optional summary and
    delegates to build_draft_from_inspiration_prompt."""
    insight = _insight()
    snapshot = _snapshot()
    summary = "# 要点总结\n- 要点一"
    expected = build_draft_from_inspiration_prompt(insight, snapshot, summary)
    assert _build_user_prompt(insight, snapshot, summary) == expected


def test_build_user_prompt_default_summary_is_none() -> None:
    """1.2: summary defaults to None — no summary section."""
    insight = _insight()
    prompt = _build_user_prompt(insight, None)
    assert build_draft_from_inspiration_prompt(insight, None, None) == prompt
    assert "要点总结" not in prompt


# --- run_draft: rewired signature (1.2) ---


def test_run_draft_signature_threads_seed_to_run_async() -> None:
    """1.2: run_draft(insight, preference_snapshot, summary, env) threads the new
    seed positionally to _run_async (which feeds generate_draft)."""
    insight = _insight()
    snapshot = _snapshot()
    captured: dict = {}

    async def fake_run_async(insight_arg, snapshot_arg, summary_arg, env_arg):
        captured["insight"] = insight_arg
        captured["snapshot"] = snapshot_arg
        captured["summary"] = summary_arg
        captured["env"] = env_arg
        return "# 成稿\n正文"

    with patch.object(draft_agent, "_run_async", side_effect=fake_run_async):
        result = draft_agent.run_draft(insight, snapshot, summary=None, env={"K": "v"})

    assert captured["insight"] is insight
    assert captured["snapshot"] is snapshot
    assert captured["summary"] is None
    assert captured["env"] == {"K": "v"}
    assert result == "# 成稿\n正文"


def test_run_draft_default_env_uses_os_environ_when_env_none() -> None:
    """1.2: env=None falls back to os.environ (parity with prior behavior)."""
    captured: dict = {}

    async def fake_run_async(insight, preference_snapshot, summary, env):
        captured["env"] = env
        return ""

    with patch.object(draft_agent, "_run_async", side_effect=fake_run_async):
        draft_agent.run_draft(_insight(), None, summary=None, env=None)

    import os
    assert captured["env"] is os.environ

