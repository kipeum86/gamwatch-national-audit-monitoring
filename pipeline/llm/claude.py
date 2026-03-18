"""Claude (Anthropic) LLM 클라이언트 구현."""

import json
import logging
from typing import Any

import anthropic

from .base import LLMClient

logger = logging.getLogger(__name__)


class ClaudeClient(LLMClient):
    """Claude API를 사용하는 LLM 클라이언트."""

    def __init__(self, api_key: str, model: str = "claude-haiku-4-5-20251001", max_tokens: int = 8192):
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = model
        self.max_tokens = max_tokens

    def process(self, system_prompt: str, user_content: str) -> dict[str, Any]:
        """Claude API에 요청을 보내고 JSON 응답을 파싱하여 반환한다."""
        logger.info("Claude API 호출: model=%s, input_len=%d", self.model, len(user_content))

        response = self.client.messages.create(
            model=self.model,
            max_tokens=self.max_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": user_content}],
        )

        raw_text = response.content[0].text
        logger.info(
            "Claude 응답: input_tokens=%d, output_tokens=%d",
            response.usage.input_tokens,
            response.usage.output_tokens,
        )

        # JSON 블록 추출 (```json ... ``` 또는 순수 JSON)
        json_text = _extract_json(raw_text)
        return json.loads(json_text)


def _extract_json(text: str) -> str:
    """LLM 응답에서 JSON 부분을 추출한다."""
    # ```json ... ``` 블록이 있는 경우
    if "```json" in text:
        start = text.index("```json") + 7
        end = text.find("```", start)
        if end == -1:
            # 닫는 ``` 없으면 끝까지
            return text[start:].strip()
        return text[start:end].strip()

    # ``` ... ``` 블록이 있는 경우
    if "```" in text:
        start = text.index("```") + 3
        end = text.find("```", start)
        if end == -1:
            return text[start:].strip()
        return text[start:end].strip()

    # { 로 시작하는 JSON 직접 반환
    text = text.strip()
    if text.startswith("{"):
        return text

    # { ... } 블록을 찾아서 추출
    brace_start = text.find("{")
    if brace_start != -1:
        brace_end = text.rfind("}")
        if brace_end > brace_start:
            return text[brace_start:brace_end + 1]

    raise ValueError(f"JSON을 찾을 수 없음: {text[:200]}")
