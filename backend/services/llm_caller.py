# -*- coding: utf-8 -*-
"""
llm_caller.py — 统一 LLM 调用接口

支持：
- openai: GPT-4o / GPT-4o-mini / GPT-4-Turbo
- claude: Claude-3.5-Haiku / Claude-3-Opus
- dashscope: qwen-turbo / qwen-plus / qwen-max

使用方式：
    from llm_caller import LLMCaller, LLMCallError

    caller = LLMCaller(api_type="openai", api_key="sk-...", model="gpt-4o-mini")
    result = await caller.chat("你好")
"""

import json
import asyncio
from typing import Optional, AsyncIterator

import httpx


class LLMCallError(Exception):
    def __init__(self, message: str, status_code: int = 0, raw: Optional[dict] = None):
        super().__init__(message)
        self.status_code = status_code
        self.raw = raw or {}


class LLMCaller:
    def __init__(self, api_type: str, api_key: str, model: str, timeout: float = 120.0):
        self.api_type = api_type.lower()
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    # ─── 同步调用 ────────────────────────────────────────────

    def call(self, system_prompt: str, user_prompt: str) -> str:
        """同步调用，返回完整响应文本。"""
        if self.api_type == "openai":
            return self._call_openai(system_prompt, user_prompt)
        elif self.api_type == "claude":
            return self._call_claude(system_prompt, user_prompt)
        elif self.api_type == "dashscope":
            return self._call_dashscope(system_prompt, user_prompt)
        else:
            raise LLMCallError(f"不支持的 api_type: {self.api_type}")

    async def acall(self, system_prompt: str, user_prompt: str) -> str:
        """异步调用。"""
        if self.api_type == "openai":
            return await self._acall_openai(system_prompt, user_prompt)
        elif self.api_type == "claude":
            return await self._acall_claude(system_prompt, user_prompt)
        elif self.api_type == "dashscope":
            return await self._acall_dashscope(system_prompt, user_prompt)
        else:
            raise LLMCallError(f"不支持的 api_type: {self.api_type}")

    async def astream(
        self, system_prompt: str, user_prompt: str
    ) -> AsyncIterator[str]:
        """
        异步流式调用，yield 每个片段。
        Yields:
            str: 每个 content 片段
        """
        if self.api_type == "openai":
            async for chunk in self._astream_openai(system_prompt, user_prompt):
                yield chunk
        elif self.api_type == "claude":
            async for chunk in self._astream_claude(system_prompt, user_prompt):
                yield chunk
        elif self.api_type == "dashscope":
            async for chunk in self._astream_dashscope(system_prompt, user_prompt):
                yield chunk
        else:
            raise LLMCallError(f"不支持的 api_type: {self.api_type}")

    # ─── OpenAI ────────────────────────────────────────────────

    def _call_openai(self, system: str, user: str) -> str:
        import openai
        client = openai.OpenAI(api_key=self.api_key, timeout=self.timeout, max_retries=0)
        resp = client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.7,
        )
        return resp.choices[0].message.content or ""

    async def _acall_openai(self, system: str, user: str) -> str:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            payload = {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "temperature": 0.7,
            }
            headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                json=payload,
                headers=headers,
            )
            if resp.status_code != 200:
                raise LLMCallError(
                    f"OpenAI API error: {resp.text}",
                    status_code=resp.status_code,
                    raw=resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {},
                )
            data = resp.json()
            return data["choices"][0]["message"]["content"]

    async def _astream_openai(self, system: str, user: str) -> AsyncIterator[str]:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            payload = {
                "model": self.model,
                "stream": True,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "temperature": 0.7,
            }
            headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
            async with client.stream(
                "POST",
                "https://api.openai.com/v1/chat/completions",
                json=payload,
                headers=headers,
            ) as resp:
                if resp.status_code != 200:
                    raw = await resp.atext()
                    raise LLMCallError(
                        f"OpenAI stream error: {raw[:500]}",
                        status_code=resp.status_code,
                    )
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data_str = line[6:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        data = json.loads(data_str)
                        content = data["choices"][0]["delta"].get("content", "")
                        if content:
                            yield content
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue

    # ─── Claude ────────────────────────────────────────────────

    def _call_claude(self, system: str, user: str) -> str:
        import anthropic
        client = anthropic.Anthropic(api_key=self.api_key, timeout=self.timeout)
        resp = client.messages.create(
            model=self.model,
            max_tokens=1024,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return resp.content[0].text

    async def _acall_claude(self, system: str, user: str) -> str:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            payload = {
                "model": self.model,
                "max_tokens": 1024,
                "system": system,
                "messages": [{"role": "user", "content": user}],
            }
            headers = {
                "x-api-key": self.api_key,
                "Content-Type": "application/json",
                "anthropic-version": "2023-06-01",
                "anthropic-dangerous-direct-browser-access": "true",
            }
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                json=payload,
                headers=headers,
            )
            if resp.status_code != 200:
                raise LLMCallError(
                    f"Claude API error: {resp.text[:500]}",
                    status_code=resp.status_code,
                )
            data = resp.json()
            return data["content"][0]["text"]

    async def _astream_claude(self, system: str, user: str) -> AsyncIterator[str]:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            payload = {
                "model": self.model,
                "max_tokens": 1024,
                "stream": True,
                "system": system,
                "messages": [{"role": "user", "content": user}],
            }
            headers = {
                "x-api-key": self.api_key,
                "Content-Type": "application/json",
                "anthropic-version": "2023-06-01",
                "anthropic-dangerous-direct-browser-access": "true",
            }
            async with client.stream(
                "POST",
                "https://api.anthropic.com/v1/messages",
                json=payload,
                headers=headers,
            ) as resp:
                if resp.status_code != 200:
                    raw = await resp.atext()
                    raise LLMCallError(f"Claude stream error: {raw[:500]}", status_code=resp.status_code)
                async for line in resp.aiter_lines():
                    if line.startswith("event:"):
                        continue
                    if line.startswith("data:"):
                        data_str = line[5:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            if data.get("type") == "content_block_delta":
                                content = data.get("delta", {}).get("text", "")
                                if content:
                                    yield content
                        except json.JSONDecodeError:
                            continue

    # ─── DashScope ────────────────────────────────────────────

    def _call_dashscope(self, system: str, user: str) -> str:
        import dashscope
        dashscope.api_key = self.api_key
        resp = dashscope.Generation.call(
            self.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            result_format="message",
        )
        if resp.status_code != 200:
            raise LLMCallError(
                f"DashScope API error: {resp.message}",
                status_code=resp.status_code,
            )
        return resp.output.choices[0].message.content

    async def _acall_dashscope(self, system: str, user: str) -> str:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            payload = {
                "model": self.model,
                "input": {
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ]
                },
                "parameters": {"result_format": "message"},
            }
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            }
            resp = await client.post(
                "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
                json=payload,
                headers=headers,
            )
            if resp.status_code != 200:
                raise LLMCallError(
                    f"DashScope API error: {resp.text[:500]}",
                    status_code=resp.status_code,
                )
            data = resp.json()
            return data["output"]["choices"][0]["message"]["content"]

    async def _astream_dashscope(self, system: str, user: str) -> AsyncIterator[str]:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            payload = {
                "model": self.model,
                "input": {
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ]
                },
                "parameters": {
                    "result_format": "message",
                    "stream": True,
                },
            }
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            }
            async with client.stream(
                "POST",
                "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
                json=payload,
                headers=headers,
            ) as resp:
                if resp.status_code != 200:
                    raw = await resp.atext()
                    raise LLMCallError(f"DashScope stream error: {raw[:500]}", status_code=resp.status_code)
                async for line in resp.aiter_lines():
                    if line.startswith("data:"):
                        data_str = line[5:].strip()
                        try:
                            data = json.loads(data_str)
                            if "output" in data and "choices" in data["output"]:
                                content = data["output"]["choices"][0]["message"]["content"]
                                if content:
                                    yield content
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue
