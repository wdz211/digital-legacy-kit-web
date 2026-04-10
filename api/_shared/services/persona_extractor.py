# -*- coding: utf-8 -*-
"""
persona_extractor.py — LLM 人设提取（Serverless 版本）
"""
import json
import re
from typing import Optional
from .llm_caller import LLMCaller, LLMCallError

EXTRACT_SYSTEM_PROMPT = """你是一个聊天记录分析专家。从给定的微信聊天记录中提取人物特征。
分析这个人的语言风格、性格特征、常用表达和话题偏好。

输出严格 JSON 格式，不要包含任何其他文字：
{
  "name": "人物称呼（从聊天记录推断，若无法确定则用contact_name）",
  "description": "一段简洁的人物简介（50字以内）",
  "language_style": "语言风格描述（30字以内）",
  "personality_traits": ["trait1", "trait2", "trait3"],
  "common_phrases": ["口头禅1", "口头禅2"],
  "topics": ["topic1", "topic2", "topic3"]
}

要求：
- 所有字段必填
- personality_traits: 3-5个，用中文简短描述性格特征
- common_phrases: 2-3个，体现语言风格的口头禅或常用表达
- topics: 2-4个，最常讨论的话题
- description 要像一个熟悉这个人的朋友写的简介
"""

DIALOGUE_SYSTEM_TEMPLATE = """你是一个名为「{{persona_name}}」的数字克隆体，基于该人物的微信聊天记录训练而成。
你的任务是延续这个角色的性格、语气、表达习惯，与用户进行自然的对话。

人物简介：{description}
语言风格：{language_style}
性格特征：{personality_traits}
常用口头禅：{common_phrases}
话题偏好：{topics}

请以「{persona_name}」的身份，用符合上述特征的方式回复。
如果用户的问题你不确定，可以诚实回答，但保持角色一致性。
"""

class ExtractionError(Exception):
    pass

def extract(messages_text: str, contact_name: str, api_type: str, api_key: str, model: str, contact_name_hint: Optional[str] = None) -> dict:
    caller = LLMCaller(api_type, api_key, model, timeout=120.0)
    inferred_name = contact_name_hint or contact_name
    user_prompt = f"以下是微信聊天记录（共 contact: {inferred_name}）：\n\n{messages_text}\n\n请提取这个人物的特征信息。"

    try:
        result = caller.call(EXTRACT_SYSTEM_PROMPT, user_prompt)
    except LLMCallError as e:
        raise ExtractionError(f"LLM 调用失败 ({e.status_code}): {str(e)}") from e

    result = result.strip()
    if result.startswith("```"):
        result = re.sub(r"^```(?:json)?\s*", "", result, 1)
        result = re.sub(r"\s*```$", "", result)
    result = result.strip()

    try:
        persona = json.loads(result)
    except json.JSONDecodeError as e:
        raise ExtractionError(f"LLM 返回的不是合法 JSON: {str(e)}\n原始输出:\n{result[:500]}") from e

    required = ["name", "description", "language_style", "personality_traits", "common_phrases", "topics"]
    for field in required:
        if field not in persona:
            persona[field] = "" if field in ("name", "description", "language_style") else []
    if not persona.get("name"):
        persona["name"] = inferred_name

    if isinstance(persona.get("personality_traits"), str):
        persona["personality_traits"] = [persona["personality_traits"]]
    if isinstance(persona.get("common_phrases"), str):
        persona["common_phrases"] = [persona["common_phrases"]]
    if isinstance(persona.get("topics"), str):
        persona["topics"] = [persona["topics"]]

    return persona

def build_dialogue_system_prompt(persona: dict) -> str:
    traits = persona.get("personality_traits", [])
    traits_str = " / ".join(traits) if isinstance(traits, list) else str(traits)
    phrases = persona.get("common_phrases", [])
    phrases_str = " / ".join(phrases) if isinstance(phrases, list) else str(phrases)
    topics = persona.get("topics", [])
    topics_str = " / ".join(topics) if isinstance(topics, list) else str(topics)
    return DIALOGUE_SYSTEM_TEMPLATE.format(
        persona_name=persona.get("name", ""),
        description=persona.get("description", ""),
        language_style=persona.get("language_style", ""),
        personality_traits=traits_str,
        common_phrases=phrases_str,
        topics=topics_str,
    )
