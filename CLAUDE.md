# GamWatch — 국정감사 게임산업 모니터링

## 프로젝트 개요
게임회사 정책/대외협력팀(비개발자)이 국정감사 중 게임 산업 관련 발언을 모니터링하는 자동화 시스템.
핵심 흐름: 유튜브 영상 → 자막 추출 → LLM 분석 → Google Sheets 저장 → GitHub Pages 대시보드

## 주요 설정
- GitHub repo: kipeum86/gamwatch-national-audit-monitoring (public, branch: master)
- Spreadsheet ID: 1IG3GWc4kChVmjYxsPw_NX3gUlKj_ehOFgOMh3RqJPRY
- 대시보드: https://kipeum86.github.io/gamwatch-national-audit-monitoring/
- LLM: Claude Haiku 4.5 (claude-haiku-4-5-20251001)
- GitHub Secrets 7개 등록 완료 (GOOGLE_SERVICE_ACCOUNT_JSON, SHEETS_API_KEY, SPREADSHEET_ID, ANTHROPIC_API_KEY, NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, GH_PAT)

## 구현 완료
- 백엔드 파이프라인 (pipeline/): subtitle_extractor, text_processor(LLM 2-pass), news_searcher, sheets_client, video_detector
- GitHub Actions (.github/workflows/pipeline.yml): cron 새벽2시 KST + workflow_dispatch
- 프론트엔드 대시보드 (docs/): 필터, 검색, 보고서 생성, 파이프라인 트리거, 실시간 상태 폴링
- UI 개선: 날짜별 아코디언, 통계바, 새로고침, 게임토글, 필터초기화, 맨위로 버튼
- PAT은 브라우저 localStorage로 관리 (보안)
- 사용설명서: GamWatch_사용설명서.md

## 핵심 미해결 이슈 (2026-03-18)
YouTube가 클라우드 IP(GitHub Actions 등)에서의 자막 추출을 완전 차단함.
yt-dlp, youtube-transcript-api 모두 Actions에서 "RequestBlocked" 실패.

### 구현한 해결책 (테스트 필요)
브라우저에서 Invidious API로 자막 추출 → gzip+base64 압축 → workflow_dispatch subtitle_data input으로 전달 → Actions는 LLM 분석만 수행.
자동추출 실패 시 수동 붙여넣기 textarea fallback 제공.

### 다음 작업
1. Sheets `_processed_videos` 탭에서 기존 BXdWgCwfUQs 행 삭제
2. 대시보드에서 영상 분석 요청 재실행하여 브라우저 자막 추출 테스트
3. Invidious 자동추출 실패 시 수동 붙여넣기 경로도 테스트
4. agendas/statements/news_articles에 결과 기록 확인
5. 대시보드에 카드 정상 표시 확인

### 테스트 영상
- URL: https://www.youtube.com/live/BXdWgCwfUQs?si=tnUiAh7iTIyJgtMd
- 상임위: 문화체육관광위원회, 일자: 2025-10-29
- 로컬에서 자막 추출 성공 확인 (8565줄, 자동생성 한국어)

## 구조
```
pipeline/          — Python 백엔드 (자막 추출, LLM 분석, Sheets 기록)
docs/              — GitHub Pages 프론트엔드 (대시보드)
.github/workflows/ — GitHub Actions 워크플로우
config.yaml        — LLM/상임위/회사명 설정
```

## 실제 사용자
옆팀 정책/대외협력 (비개발자). PAT을 공유받아 대시보드에서 사용. CLI 사용 불가.
