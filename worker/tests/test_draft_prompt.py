"""Tests for ``build_draft_from_inspiration_prompt``.

Covers the Prompt Strategy field mapping:
- topic → central topic / title direction
- followUpQuestions → section skeleton / sub-arguments
- suitableUse → form & platform wording (drives skill loading)
- matchReason → intent anchor
- PreferenceSnapshot → tone/audience/angle/avoid; missing → no persona fabrication
- sourceChunkId → annotation only; transcript chunk text never enters prompt
- summary → optional original-video grounding; when None, no mention
"""

from __future__ import annotations

from frameq_worker.insightflow.prompt import build_draft_from_inspiration_prompt
from frameq_worker.models import (
    GenerationPreferences,
    Insight,
    InspirationProfile,
    PreferenceLabelSnapshot,
    PreferenceSnapshot,
)

# --- helpers ---------------------------------------------------------------


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
        profile=InspirationProfile(
            role="内容运营",
            domain="企业服务",
            stage="成长期",
            city_context="上海",
            gender_perspective="不限",
            platforms=("xiaohongshu",),
            default_styles=("直接",),
            default_avoid=("空话",),
        ),
        profile_skipped=False,
        generation_preferences=GenerationPreferences(
            goal="建立专业影响力",
            scenario="小红书图文",
            angles=("实操方法",),
            audience="B 端运营负责人",
            styles=("口语化",),
            avoid=("过度营销",),
        ),
        label_snapshot=PreferenceLabelSnapshot(profile=(), generation_preferences=()),
    )


# --- core content: seed fields mapped into prompt --------------------------


def test_prompt_includes_topic_as_central_direction() -> None:
    prompt = build_draft_from_inspiration_prompt(_insight(), None, summary=None)
    # topic is the load-bearing direction; must appear verbatim.
    assert "企业级 Agent 和通用 AI 工具的价值分水岭是什么？" in prompt


def test_prompt_includes_follow_ups_as_skeleton() -> None:
    prompt = build_draft_from_inspiration_prompt(_insight(), None, summary=None)
    assert "上下文能力为何决定 Agent 上限？" in prompt
    assert "流程编排如何影响落地成本？" in prompt


def test_prompt_includes_match_reason_as_intent_anchor() -> None:
    prompt = build_draft_from_inspiration_prompt(_insight(), None, summary=None)
    assert "源自原视频对 Context/Orchestration 的核心判断" in prompt


def test_prompt_includes_source_chunk_id_as_annotation_only() -> None:
    """sourceChunkId surfaces ONLY as a source annotation; its transcript chunk
    text must never enter the prompt. The function never receives chunk
    text, so we guard: the id is annotated, AND there is no `## 文字稿原文`
    section header (which would indicate raw transcript injection)."""
    insight = _insight(source_chunk_id=7)
    prompt = build_draft_from_inspiration_prompt(insight, None, summary=None)
    assert "7" in prompt  # annotation surface
    assert "## 文字稿原文" not in prompt
    assert "## 原文片段" not in prompt
    assert "transcript" not in prompt.lower()


def test_prompt_omits_source_chunk_annotation_when_absent() -> None:
    insight = _insight(source_chunk_id=None)
    prompt = build_draft_from_inspiration_prompt(insight, None, summary=None)
    # When no sourceChunkId, the annotation marker should be absent or clearly
    # indicate "no source". We accept either "无" or omission of an id block.
    assert "源段" not in prompt or "无" in prompt


# --- suitableUse → form / platform wording (1.3 / 1.4) --------------------


def test_suitable_use_gongzhonghao_aligned_to_wechat_official_account() -> None:
    """1.3: 公众号 ↔ 微信公众号 alignment in form wording."""
    prompt = build_draft_from_inspiration_prompt(
        _insight(suitable_use="公众号"), None, summary=None
    )
    assert "微信公众号" in prompt


def test_suitable_use_values_produce_form_wording() -> None:
    """suitableUse drives form wording across the v1-supported platforms."""
    for use, marker in [
        ("抖音", "抖音"),
        ("小红书", "小红书"),
        ("公众号", "微信公众号"),  # aligned name
        ("视频号", "视频号"),
    ]:
        prompt = build_draft_from_inspiration_prompt(
            _insight(suitable_use=use), None, summary=None
        )
        assert marker in prompt, f"suitableUse={use!r} missing form marker {marker!r}"


def test_unknown_suitable_use_falls_back_without_fabrication() -> None:
    """non-v1 suitableUse falls back to LLM general capability — the
    prompt must not fabricate platform-specific skill instructions."""
    prompt = build_draft_from_inspiration_prompt(
        _insight(suitable_use="播客"), None, summary=None
    )
    assert "播客" in prompt
    # No fabricated v1-platform-specific wording leaked in.
    assert "抖音" not in prompt
    assert "小红书" not in prompt
    assert "微信公众号" not in prompt


# --- preference snapshot: present vs absent (1.4) --------------------------


def test_prompt_with_snapshot_includes_personalization_fields() -> None:
    prompt = build_draft_from_inspiration_prompt(_insight(), _snapshot(), summary=None)
    # generation preferences surface
    assert "建立专业影响力" in prompt  # goal
    assert "B 端运营负责人" in prompt  # audience
    assert "实操方法" in prompt  # angles
    assert "口语化" in prompt  # styles
    assert "过度营销" in prompt  # avoid
    # profile surface
    assert "内容运营" in prompt  # role
    assert "企业服务" in prompt  # domain


def test_prompt_without_snapshot_does_not_fabricate_persona() -> None:
    """missing snapshot → no personalization; NEVER fabricate a
    USER persona (role/domain/style/audience) as if the user had specified one.
    The agent's own job role ("成稿编辑") is fine; a fabricated *user* persona
    is not."""
    prompt = build_draft_from_inspiration_prompt(_insight(), None, summary=None)
    # Must NOT fabricate a user-side persona. "你是一位" is the agent's job
    # role, not a user persona — exclude it explicitly from the forbidden set.
    forbidden = ["默认受众", "默认角色", "假设受众", "默认风格", "你的角色", "你的受众"]
    for word in forbidden:
        assert word not in prompt, f"fabrication marker {word!r} present without snapshot"
    # Must explicitly signal the no-personalization posture.
    assert "不进行个性化" in prompt
    assert "臆造" in prompt or "不要臆造" in prompt


# --- summary: optional original-video grounding (1.1) ----------------------


def test_prompt_with_summary_references_summary_as_grounding() -> None:
    summary = "# 要点总结\n- 原视频强调上下文工程\n- 编排决定落地成本"
    prompt = build_draft_from_inspiration_prompt(_insight(), None, summary=summary)
    assert summary in prompt
    assert "要点总结" in prompt


def test_prompt_without_summary_silently_omits_summary_section() -> None:
    """summary is OPTIONAL: when None, the prompt must say nothing about it."""
    prompt = build_draft_from_inspiration_prompt(_insight(), None, summary=None)
    assert "要点总结" not in prompt
    assert "summary" not in prompt.lower()
