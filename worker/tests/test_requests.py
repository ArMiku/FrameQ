from __future__ import annotations

import pytest
from frameq_worker.requests import (
    parse_generate_draft_request,
    parse_process_request,
    parse_retry_insights_request,
)


def valid_preference_snapshot() -> dict[str, object]:
    return {
        "profile": {
            "role": "content_creator",
            "domain": "content_media",
            "stage": "experienced_professional",
            "cityContext": "new_tier1_city",
            "genderPerspective": "neutral_perspective",
            "platforms": ["douyin"],
            "defaultStyles": ["grounded"],
            "defaultAvoid": ["clickbait"],
        },
        "profileSkipped": False,
        "generationPreferences": {
            "goal": "content_creation",
            "scenario": "short_video",
            "angles": ["topic_angle"],
            "audience": "fans_readers",
            "styles": ["grounded"],
            "avoid": ["clickbait"],
        },
        "labelSnapshot": {
            "profile": [
                {
                    "field": "role",
                    "label": "我的角色",
                    "values": [{"id": "content_creator", "label": "内容创作者"}],
                }
            ],
            "generationPreferences": [
                {
                    "field": "goal",
                    "label": "本次目标",
                    "values": [{"id": "content_creation", "label": "内容创作"}],
                }
            ],
        },
    }


def test_process_request_does_not_accept_preference_snapshot() -> None:
    request = parse_process_request(
        {
            "url": "https://www.douyin.com/video/7524373044106677544",
            "preference_snapshot": valid_preference_snapshot(),
        }
    )

    assert not hasattr(request, "preference_snapshot")


def test_process_request_has_no_ai_generation_field() -> None:
    request = parse_process_request(
        {
            "url": "https://www.douyin.com/video/7524373044106677544",
        }
    )

    assert not hasattr(request, "generate_insights")


def test_process_request_rejects_retired_ai_generation_field_without_echoing_input() -> None:
    with pytest.raises(ValueError) as error:
        parse_process_request(
            {
                "url": "https://user:review-secret@www.example.com/private",
                "generate_insights": True,
            }
        )

    assert str(error.value) == "Process request contains an unsupported field."
    assert "review-secret" not in str(error.value)
    assert "https://" not in str(error.value)


def test_retry_request_parses_preference_snapshot() -> None:
    request = parse_retry_insights_request(
        {
            "task_id": "20260705-153012-douyin-demo",
            "target": "insights",
            "preference_snapshot": valid_preference_snapshot(),
        }
    )

    assert request.target == "insights"
    assert request.preference_snapshot is not None
    assert request.preference_snapshot.profile is not None
    assert request.preference_snapshot.profile.role == "content_creator"
    assert request.preference_snapshot.profile_skipped is False
    assert request.preference_snapshot.generation_preferences.goal == "content_creation"
    assert request.preference_snapshot.generation_preferences.angles == ("topic_angle",)
    assert request.preference_snapshot.label_snapshot.generation_preferences[0].field == "goal"


def test_retry_request_rejects_invalid_preference_snapshot_options() -> None:
    snapshot = valid_preference_snapshot()
    generation_preferences = snapshot["generationPreferences"]
    assert isinstance(generation_preferences, dict)
    generation_preferences["angles"] = ["topic_angle", "not_a_real_angle"]

    with pytest.raises(ValueError, match="preference_snapshot"):
        parse_retry_insights_request(
            {
                "task_id": "20260705-153012-douyin-demo",
                "target": "insights",
                "preference_snapshot": snapshot,
            }
        )


def test_retry_request_requires_generation_target() -> None:
    with pytest.raises(ValueError, match="target"):
        parse_retry_insights_request({"task_id": "20260705-153012-douyin-demo"})


def test_retry_request_rejects_unknown_generation_target() -> None:
    with pytest.raises(ValueError, match="target"):
        parse_retry_insights_request(
            {
                "task_id": "20260705-153012-douyin-demo",
                "target": "both",
            }
        )


def test_retry_summary_request_rejects_preference_snapshot() -> None:
    with pytest.raises(ValueError, match="preference_snapshot"):
        parse_retry_insights_request(
            {
                "task_id": "20260705-153012-douyin-demo",
                "target": "summary",
                "preference_snapshot": valid_preference_snapshot(),
            }
        )


@pytest.mark.parametrize(
    "task_id",
    [
        "../outside",
        "nested/task",
        "nested\\task",
        "C:/FrameQ/task",
        "20260705-153012-douyin-demo/../outside",
    ],
)
def test_retry_request_rejects_task_id_path_traversal(task_id: str) -> None:
    with pytest.raises(ValueError, match="task_id"):
        parse_retry_insights_request({"task_id": task_id, "target": "insights"})


def test_generate_draft_request_parses_valid_payload() -> None:
    request = parse_generate_draft_request(
        {
            "task_id": "20260705-153012-douyin-demo",
            "topic": "如何把长视频拆成短视频",
            "summary": "# 要点总结\n- 要点一",
            "target_platform": "xiaohongshu",
        }
    )

    assert request.task_id == "20260705-153012-douyin-demo"
    assert request.topic == "如何把长视频拆成短视频"
    assert request.summary == "# 要点总结\n- 要点一"
    assert request.target_platform == "xiaohongshu"


def test_generate_draft_request_accepts_any_non_empty_target_platform() -> None:
    # target_platform 不校验枚举成员（design D3）：平台枚举的 source of truth 在前端，
    # 后端只透传任意非空 id 做槽位填充。
    request = parse_generate_draft_request(
        {
            "task_id": "20260705-153012-douyin-demo",
            "topic": "topic",
            "summary": "summary",
            "target_platform": "totally_unknown_platform_123",
        }
    )

    assert request.target_platform == "totally_unknown_platform_123"


@pytest.mark.parametrize(
    "payload, matched_message",
    [
        ("not-a-dict", "JSON object"),
        (
            {
                "task_id": "20260705-153012-douyin-demo",
                "topic": "t",
                "summary": "s",
            },
            "target_platform",
        ),
        (
            {
                "task_id": "20260705-153012-douyin-demo",
                "topic": "t",
                "summary": "s",
                "target_platform": "",
            },
            "target_platform",
        ),
        ({"topic": "t", "summary": "s", "target_platform": "p"}, "task_id"),
        (
            {
                "task_id": " ",
                "topic": "t",
                "summary": "s",
                "target_platform": "p",
            },
            "task_id",
        ),
        (
            {
                "task_id": "20260705-153012-douyin-demo",
                "topic": "  ",
                "summary": "s",
                "target_platform": "p",
            },
            "topic",
        ),
        (
            {
                "task_id": "20260705-153012-douyin-demo",
                "topic": "t",
                "summary": "",
                "target_platform": "p",
            },
            "summary",
        ),
    ],
)
def test_generate_draft_request_rejects_invalid_payload(payload, matched_message) -> None:
    with pytest.raises(ValueError, match=matched_message):
        parse_generate_draft_request(payload)


@pytest.mark.parametrize(
    "task_id",
    ["../outside", "nested/task", "nested\\task", "20260705-153012-douyin-demo/../outside"],
)
def test_generate_draft_request_rejects_task_id_path_traversal(task_id: str) -> None:
    with pytest.raises(ValueError, match="task_id"):
        parse_generate_draft_request(
            {"task_id": task_id, "topic": "t", "summary": "s", "target_platform": "p"}
        )
