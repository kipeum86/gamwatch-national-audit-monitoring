"""yt-dlp를 사용한 유튜브 자막 추출 및 VTT 파싱."""

import logging
import re
import subprocess
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)


def extract_subtitles(video_id: str) -> tuple[str | None, str]:
    """유튜브 영상에서 한국어 자막을 추출한다.

    Returns:
        (자막 텍스트, 자막 소스) 튜플.
        자막 소스: "stenographer" / "auto_generated" / "none"
        자막이 없으면 (None, "none") 반환.
    """
    url = f"https://www.youtube.com/watch?v={video_id}"

    with tempfile.TemporaryDirectory() as tmpdir:
        output_template = str(Path(tmpdir) / video_id)

        cmd = [
            "yt-dlp",
            "--write-sub",
            "--write-auto-sub",
            "--sub-lang", "ko",
            "--sub-format", "vtt",
            "--skip-download",
            "-o", output_template,
            url,
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120,
            )
            if result.returncode != 0:
                logger.warning("yt-dlp 실행 실패: %s", result.stderr[:500])
        except subprocess.TimeoutExpired:
            logger.error("yt-dlp 타임아웃: %s", video_id)
            return None, "none"

        # 속기사 자막 우선, 없으면 자동생성 자막
        steno_path = Path(tmpdir) / f"{video_id}.ko.vtt"
        auto_path = Path(tmpdir) / f"{video_id}.ko.auto.vtt"

        if steno_path.exists():
            text = _parse_vtt(steno_path, is_auto=False)
            return text, "stenographer"
        elif auto_path.exists():
            text = _parse_vtt(auto_path, is_auto=True)
            return text, "auto_generated"
        else:
            # 다른 패턴의 파일명도 확인
            vtt_files = list(Path(tmpdir).glob("*.vtt"))
            if vtt_files:
                is_auto = "auto" in vtt_files[0].name.lower()
                text = _parse_vtt(vtt_files[0], is_auto=is_auto)
                source = "auto_generated" if is_auto else "stenographer"
                return text, source

            logger.info("자막 없음: %s", video_id)
            return None, "none"


def _parse_vtt(vtt_path: Path, is_auto: bool = False) -> str:
    """VTT 파일을 파싱하여 순수 텍스트를 반환한다.

    자동생성 자막의 경우 중복 라인을 제거한다.
    """
    content = vtt_path.read_text(encoding="utf-8")
    lines = content.split("\n")

    text_lines = []
    prev_line = ""

    for line in lines:
        line = line.strip()

        # VTT 헤더, 타임스탬프, 빈 줄 건너뛰기
        if not line:
            continue
        if line.startswith("WEBVTT"):
            continue
        if line.startswith("Kind:") or line.startswith("Language:"):
            continue
        if line.startswith("NOTE"):
            continue
        if re.match(r"^\d{2}:\d{2}:\d{2}\.\d{3}\s*-->", line):
            continue
        if re.match(r"^\d+$", line):
            continue

        # VTT 태그 제거
        cleaned = re.sub(r"<[^>]+>", "", line)
        cleaned = cleaned.strip()

        if not cleaned:
            continue

        # 자동생성 자막: 중복 라인 제거
        if is_auto:
            if cleaned == prev_line:
                continue
            # 80% 이상 겹치면 스킵
            if prev_line and _overlap_ratio(prev_line, cleaned) > 0.8:
                continue

        text_lines.append(cleaned)
        prev_line = cleaned

    return "\n".join(text_lines)


def _overlap_ratio(a: str, b: str) -> float:
    """두 문자열의 겹침 비율을 계산한다."""
    if not a or not b:
        return 0.0
    shorter = min(len(a), len(b))
    matches = sum(1 for ca, cb in zip(a, b) if ca == cb)
    return matches / shorter
