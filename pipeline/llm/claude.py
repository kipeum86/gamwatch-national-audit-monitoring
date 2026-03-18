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
        try:
            return json.loads(json_text)
        except json.JSONDecodeError:
            # LLM이 깨진 JSON을 반환한 경우 자동 복구 시도
            repaired = _repair_json(json_text)
            return json.loads(repaired)


def _repair_json(text: str) -> str:
    """깨진 JSON을 최대한 복구한다."""
    import re
    # 흔한 오류: 문자열 내 이스케이프 안 된 따옴표, trailing comma
    # trailing comma 제거: ,] → ] , ,} → }
    text = re.sub(r',\s*([}\]])', r'\1', text)
    # 줄바꿈이 문자열 안에 들어간 경우
    # 각 줄이 유효한지 점진적으로 잘라서 시도
    # 마지막 수단: 깨진 위치까지 잘라서 배열/객체 닫기
    try:
        json.loads(text)
        return text
    except json.JSONDecodeError as e:
        # 깨진 위치에서 잘라서 닫기 시도
        pos = e.pos or 0
        truncated = text[:pos].rstrip().rstrip(',')
        # 열린 괄호 수 세서 닫기
        open_braces = truncated.count('{') - truncated.count('}')
        open_brackets = truncated.count('[') - truncated.count(']')
        truncated += ']' * open_brackets + '}' * open_braces
        logger.warning("JSON 복구 시도: 원본 %d자 → %d자로 잘라냄", len(text), len(truncated))
        return truncated


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
