from __future__ import annotations

import json

from frameq_worker.models import PreferenceSnapshot


def build_topic_plan_prompt(
    text: str,
    max_topics: int = 8,
    max_questions: int = 12,
    language: str = "中文",
    preference_snapshot: PreferenceSnapshot | None = None,
) -> str:
    preference_prompt_section = ""
    if preference_snapshot is not None:
        preference_prompt_section = f"""
## 个性化偏好快照
以下 JSON 只用于启发话题点的选段、排序和 question_count 分配，不用于总结或思维导图。
优先参考 `generationPreferences` 判断哪些话题段更贴近本次目标、场景、关注角度和受众；
`labelSnapshot` 仅用于理解选项含义。
```json
{format_preference_snapshot_for_prompt(preference_snapshot)}
```
"""

    return f"""
# 角色使命
你是一位话题分段规划师。你的任务不是生成问题，而是先把一整段可能没有自然分段的 ASR 文字稿，
规划成适合后续生成启发话题点的语义话题段。

## 核心任务
根据用户提供的文字稿（长度：{len(text)} 字），提炼最多 {max_topics} 个高价值话题段。
所有输出必须使用：{language}。
{preference_prompt_section}

## 规划原则
- 忽略寒暄、重复、口头禅、无信息铺垫和单纯转场。
- 优先保留有观点、方法、冲突、经验、决策、行业判断或技术落地价值的内容。
- 个性化偏好只能调整话题段优先级、排序和 `question_count`，不得补充文字稿没有的事实或观点。
- 当偏好与文字稿事实冲突时，以文字稿事实为准。
- 每个话题段只聚焦一个主要议题，避免把多个不相关主题混在一起。
- `excerpt` 必须来自原文字稿或忠实贴近原文表达，用于给后续问题生成提供上下文。
- `question_count` 必须根据话题密度设置为 1 到 3 之间的整数。
- 所有话题段的 `question_count` 总和不得超过 {max_questions}。

## 输出格式
- 只输出 JSON 数组，不要输出解释、Markdown 或额外文字。
- JSON 数组必须严格符合以下结构：
```json
[
  {{
    "id": 1,
    "title": "话题标题",
    "summary": "这一段主要在讲什么",
    "excerpt": "从原文字稿中提取或忠实压缩的相关片段",
    "question_count": 2
  }}
]
```

## 待处理文字稿
{text}
"""


def build_question_prompt(
    text: str,
    number: int,
    language: str = "中文",
    global_prompt: str = "",
    question_prompt: str = "",
    preference_snapshot: PreferenceSnapshot | None = None,
) -> str:
    global_prompt_section = ""
    if global_prompt:
        global_prompt_section = f"""
## 全局附加约束
{global_prompt}
"""

    question_prompt_section = ""
    if question_prompt:
        question_prompt_section = f"""
## 本次问题生成附加要求
{question_prompt}
"""

    preference_prompt_section = ""
    if preference_snapshot is not None:
        preference_prompt_section = f"""
## 个性化偏好快照
以下 JSON 只用于生成启发话题点，不用于总结或思维导图。
优先参考 `generationPreferences`，`labelSnapshot` 仅用于理解选项含义。
```json
{format_preference_snapshot_for_prompt(preference_snapshot)}
```
"""

    return f"""
# 角色使命
你是一位阅读思考伙伴和议题策展者。你的任务不是把文章改写成阅读理解题，
而是从文章案例中提炼能够启发用户继续思考的开放式议题问句。
{global_prompt_section}
{preference_prompt_section}

## 核心任务
根据用户提供的文本（长度：{len(text)} 字），生成不少于 {number} 个高质量问题。
每个问题都必须是可迁移的议题问句，输出语言必须是：{language}。
{question_prompt_section}

## 生成原则
- 优先抽象为行业、方法、组织、决策、技术落地等可迁移角度。
- 避免阅读理解式问题，不要要求用户复述文章中的某家公司、某个人物、某个产品做了什么。
- 默认不要把公司名、人物名、产品名作为问题主语；可以把它们作为案例来源，
  但问题本身要指向更通用的思考角度。
- 问题应当开放、具体、有讨论价值，适合用户点击后继续追问或回答。
- 不要生成事实核对题、定义题、摘要题、考试题。

## 面向人类读者的表达优化
- 站在人类读者的视角写问题，问题本身要自然、清晰、顺口，读完就知道可以从哪个角度思考。
- 每个问题只聚焦一个核心思考点，避免把多个条件、比较对象和结论塞进同一句。
- 少用嵌套从句、抽象名词堆叠和过长限定语；必要时用短句表达因果或对比。
- 避免机器翻译腔、模板化问法和生硬术语；专业概念要放在清楚的语境里。
- 问题长度尽量控制在一行可读范围内，不为了显得专业而牺牲理解成本。

## 风格示例
- 避免：特赞科技推出的 GEA 与传统工具有何区别？
- 改为：企业级 Agent 和通用 AI 工具的价值分水岭是什么？
- 避免：范凌认为 Context 和 Orchestration 分别是什么意思？
- 改为：为什么企业 AI 落地时，上下文能力和流程编排可能比单点模型能力更关键？

## 输出格式
- JSON 数组格式必须正确
- 输出的 JSON 数组必须严格符合以下结构：
```json
[
  {{
    "topic": "启发话题点",
    "matchReason": "为什么这个话题匹配文字稿和偏好",
    "followUpQuestions": ["可以继续追问的问题"],
    "suitableUse": "适合的使用场景"
  }}
]
```

## 待处理文本
{text}
"""


def format_preference_snapshot_for_prompt(snapshot: PreferenceSnapshot) -> str:
    return json.dumps(
        {
            "profile": _profile_to_prompt_dict(snapshot),
            "profileSkipped": snapshot.profile_skipped,
            "generationPreferences": {
                "goal": snapshot.generation_preferences.goal,
                "scenario": snapshot.generation_preferences.scenario,
                "angles": list(snapshot.generation_preferences.angles),
                "audience": snapshot.generation_preferences.audience,
                "styles": list(snapshot.generation_preferences.styles),
                "avoid": list(snapshot.generation_preferences.avoid),
            },
            "labelSnapshot": {
                "profile": [
                    _label_snapshot_item_to_prompt_dict(item)
                    for item in snapshot.label_snapshot.profile
                ],
                "generationPreferences": [
                    _label_snapshot_item_to_prompt_dict(item)
                    for item in snapshot.label_snapshot.generation_preferences
                ],
            },
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )


def _profile_to_prompt_dict(snapshot: PreferenceSnapshot) -> dict[str, object] | None:
    if snapshot.profile is None:
        return None
    return {
        "role": snapshot.profile.role,
        "domain": snapshot.profile.domain,
        "stage": snapshot.profile.stage,
        "cityContext": snapshot.profile.city_context,
        "genderPerspective": snapshot.profile.gender_perspective,
        "platforms": list(snapshot.profile.platforms),
        "defaultStyles": list(snapshot.profile.default_styles),
        "defaultAvoid": list(snapshot.profile.default_avoid),
    }


def _label_snapshot_item_to_prompt_dict(item) -> dict[str, object]:
    return {
        "field": item.field,
        "label": item.label,
        "values": [
            {
                "id": value.id,
                "label": value.label,
            }
            for value in item.values
        ],
    }


def build_mindmap_prompt(
    text: str,
    language: str = "中文",
) -> str:
    return f"""
# 角色使命
你是一位逻辑思维导图整理师。你的任务是根据文字稿原文，提炼内容的主线、分支和层级关系，
输出一份可以直接保存到本地文件的 Mermaid mindmap 文本。

## 核心任务
根据用户提供的文字稿（长度：{len(text)} 字），整理为逻辑清晰的思维导图。
所有节点必须使用：{language}。

## 生成原则
- 优先呈现观点、方法、因果、步骤、冲突、结论和可迁移经验。
- 删除寒暄、重复、口头禅和无信息转场。
- 顶层节点应表达整段文字稿的核心主题，二级和三级节点表达主要分支和支撑要点。
- 节点文字要短，避免整句长段落。
- 不要补充原文没有的事实、数字、人物或结论。

## 输出格式
- 只输出 Mermaid mindmap 源码，不要输出解释、Markdown 代码围栏或额外文字。
- 第一行必须是 `mindmap`。
- 使用 Mermaid mindmap 语法，例如：
mindmap
  root((核心主题))
    分支一
      要点一
    分支二
      要点二

## 待处理文字稿
{text}
"""


def build_summary_prompt(
    transcript_markdown: str,
    mermaid_mindmap: str,
    language: str = "中文",
) -> str:
    return f"""
# 角色使命
你是一位内容总结编辑。你的任务是根据文字稿原文和 Mermaid 思维导图，对文字稿做要点总结。

## 输入材料
### 文字稿原文
{transcript_markdown}

### Mermaid 思维导图
{mermaid_mindmap}

## 输出要求
- 使用：{language}。
- 只输出 Markdown 总结正文，不要输出 Mermaid 文本、代码围栏或解释过程。
- 结构必须包含 `# 要点总结` 标题。
- 使用分层 Markdown：先写 `## 总览`，再写 2 到 6 个主题小节，每个主题小节下用短要点概括。
- 总结必须忠实于文字稿原文；Mermaid 只用于帮助组织逻辑，不得引入新事实。
- 要点要适合 UI 直接展示和复制，避免空泛套话。
"""
