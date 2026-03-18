# GamWatch — 국정감사 게임산업 모니터링 시스템 설계 사양서

> **문서 버전:** v2.0 (최종)
> **작성일:** 2026-03-18
> **상태:** Phase 2 완료 — 설계 확정

---

## 1. Overview

GamWatch는 게임회사 정책/대외협력팀이 국정감사 기간(연 1회, 약 3주) 동안 자사 및 게임 산업 관련 국감 발언을 당일 내에 파악할 수 있는 자동화된 모니터링 시스템이다.

국회방송 유튜브 영상에서 자막을 추출하고 LLM으로 정리하여 Google Sheets에 저장하며, GitHub Pages 기반 정적 사이트에서 모니터링 대시보드와 내부 Slack 보고서 생성 기능을 제공한다.

비개발자인 모니터링 담당자가 별도 조작 없이 결과 페이지만 확인하면 되도록 설계되며, 초기 세팅 후 무인 운영을 목표로 한다. 담당자는 대시보드의 "파이프라인 실행" 버튼으로 원하는 시점에 즉시 처리를 트리거할 수 있다.

**핵심 사용자:** 게임회사 정책/대외협력팀 모니터링 담당자 (비개발자)
**핵심 가치:** 수 시간의 국감 영상 시청 → 자동 정리된 대시보드 + 1분 내 Slack 보고서 생성

---

## 2. Goals & Non-Goals

### Goals

- **G1:** 국감 기간 중 대상 상임위(정무위, 과방위, 문체위, 산자위 + 필요시 법사위, 복지위) 영상에서 게임 산업 관련 발언을 당일 내에 자동 추출하여 Google Sheets에 기록한다
- **G2:** 게임 관련 발언은 내부 보고 양식에 맞춰 상세 정리(질의 의원/당적, 발언 요약, 답변자 응답, 자사 관련 ※ 하이라이트)하고, 나머지 안건은 1줄 요약으로 처리하며, 안건별 관련 기사를 자동 검색하여 URL과 제목을 매칭한다
- **G3:** GitHub Pages 정적 사이트에서 상임위별/날짜별 브라우징 및 키워드 검색이 가능한 모니터링 대시보드를 제공한다
- **G4:** 대시보드 내 보고서 생성 기능으로, 날짜/상임위 선택 시 내부 Slack 보고 양식에 맞는 텍스트를 생성하고 클립보드 복사를 지원한다
- **G5:** 백업용 cron(매일 새벽 2시 KST) + 대시보드 내 "파이프라인 실행" 버튼(즉시 트리거)의 이중 구조로 운영한다
- **G6:** 비개발자(모니터링 담당자)가 사이트 접속만으로 모든 기능을 사용할 수 있다
- **G7:** 국감 영상 자동 처리 외에, 담당자가 수동으로 추가 영상(대통령 간담회, 문체부 업무보고 등)의 URL을 입력하면 동일한 파이프라인으로 처리한다

### Non-Goals

- **NG1:** 라이브 스트리밍 중 실시간 분석은 하지 않는다. 라이브 종료 후 VOD 자막 기반으로 처리한다
- **NG2:** 사용자별 개인화(로그인, 알림 설정, 관심 키워드 등록)는 제공하지 않는다
- **NG3:** 국감 외 기간의 상시 자동 모니터링은 범위에 포함하지 않는다 (수동 트랙으로 spot 이벤트는 처리 가능)
- **NG4:** 발언 내용의 정확도를 100% 보장하지 않는다. 자막 원본의 한계를 명시하고, 담당자가 Sheets에서 직접 보정할 수 있는 구조로 둔다
- **NG5:** Slack 자동 발송(봇)은 구현하지 않는다. 보고서 텍스트 생성 → 담당자가 복붙하는 방식이다
- **NG6:** 자막이 없는 영상에 대한 별도 STT(Whisper 등)는 구현하지 않는다. 유튜브 자막(속기사 또는 자동생성)이 없으면 해당 영상은 스킵한다

---

## 3. Architecture

### 3.1 System Diagram

```
                       ┌──────────────────────────┐
                       │   GitHub Pages 대시보드    │
                       │                          │
                       │  "파이프라인 실행" 버튼 ──────────┐
                       │   모니터링 대시보드        │     │
                       │   보고서 생성기           │     │
                       └────────────▲─────────────┘     │
                                    │ Sheets API 읽기    │ workflow_dispatch API
                                    │                    │
                       ┌────────────┴─────────────┐     │
                       │      Google Sheets        │     │
                       │      (데이터 저장소)        │     │
                       └────────────▲─────────────┘     │
                                    │                    │
┌───────────────────────────────────┼────────────────────┼──┐
│              GitHub Actions                            │  │
│   cron: 매일 새벽 2시 KST (백업)   ◀─────────────────────┘  │
│   workflow_dispatch (즉시 트리거)                          │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  영상 감지기   │─▶│  자막 추출기   │─▶│  텍스트 처리기  │  │
│  │ YouTube API  │  │  yt-dlp      │  │ 키워드 필터     │  │
│  │ + 수동 큐     │  │              │  │ + LLM 정리     │  │
│  └──────────────┘  └──────────────┘  └───────┬────────┘  │
│                                               │           │
│                    ┌──────────────────────┐    │           │
│                    │  기사 검색기           │◀───┘           │
│                    │  Naver Search API    │               │
│                    └──────────┬───────────┘               │
│                               │                           │
│                    ┌──────────▼───────────┐               │
│                    │  Sheets 기록기        │               │
│                    │  Google Sheets API   │               │
│                    └─────────────────────┘               │
└───────────────────────────────────────────────────────────┘
```

### 3.2 Components

**1. 영상 감지기 (Video Detector)**
- **책임:** 대상 상임위의 국감 관련 신규 유튜브 영상을 식별하고, 수동 입력 대기열의 영상을 합쳐 처리 대상 목록을 생성한다
- **입력:** YouTube Data API v3 채널 검색 + `_manual_queue` Sheets 탭에서 status="pending"인 행
- **출력:** 미처리 신규 영상 ID/URL 목록
- **의존:** YouTube Data API (GCP 서비스 계정), Google Sheets API

**2. 자막 추출기 (Subtitle Extractor)**
- **책임:** 유튜브 영상에서 한국어 자막 텍스트를 추출한다
- **입력:** 영상 ID 또는 URL
- **출력:** 자막 텍스트 (VTT 파싱 후 순수 텍스트)
- **의존:** yt-dlp
- **자막 없는 영상:** 스킵 처리 (status="no_subtitle"로 기록)

**3. 텍스트 처리기 (Text Processor)**
- **책임:** 자막 텍스트에서 게임 관련 발언을 식별하고 내부 양식에 맞게 정리한다
- **입력:** 자막 전문 텍스트
- **출력:** 구조화된 안건 데이터 (JSON)
- **처리:** 키워드 1차 필터 → LLM으로 안건 목록 생성 + 게임 관련 상세 정리 + 나머지 1줄 요약 + 놓친 게임 내용 2차 확인
- **의존:** LLM API (초기: Claude Haiku 4.5, 사내 on-premise 전환 가능)

**4. 기사 검색기 (News Searcher)**
- **책임:** 게임 관련 안건에 대해 관련 뉴스 기사를 검색하여 제목+URL 매칭
- **입력:** 안건 요약 텍스트, 질의 의원명
- **출력:** 안건별 관련 기사 목록
- **의존:** Naver Search API

**5. Sheets 기록기 (Sheets Writer)**
- **책임:** 처리된 데이터를 Google Sheets에 구조화하여 기록
- **의존:** Google Sheets API (GCP 서비스 계정)

**6. 모니터링 대시보드 (Dashboard)**
- **책임:** Sheets 데이터를 읽어 상임위별/날짜별 브라우징, 키워드 검색 UI 제공
- **의존:** Google Sheets API (읽기 전용 API 키)

**7. 보고서 생성기 (Report Generator)**
- **책임:** 선택된 날짜/상임위 데이터를 내부 Slack 보고 양식으로 포맷팅 → 클립보드 복사
- **의존:** 대시보드 컴포넌트 내에 포함

**8. 파이프라인 트리거 (Pipeline Trigger)**
- **책임:** 대시보드 내 "파이프라인 실행" 버튼 클릭 시 GitHub Actions workflow_dispatch API를 호출하여 파이프라인을 즉시 실행
- **의존:** GitHub REST API, GitHub Personal Access Token

---

## 4. Data Model

### 4.1 Entities

하나의 Google Spreadsheet 파일 안에 5개 탭.

#### ProcessedVideo — 탭: `_processed_videos`

| 필드 | 타입 | 설명 |
|------|------|------|
| video_id | string (PK) | 유튜브 영상 ID |
| committee | string | 상임위 또는 기관명 |
| date | date | 행사 일자 (YYYY-MM-DD) |
| title | string | 영상 제목 |
| video_url | string | 유튜브 URL |
| source | enum | "auto" / "manual" |
| subtitle_source | enum | "stenographer" / "auto_generated" / "none" |
| processed_at | datetime | 처리 완료 시각 |
| status | enum | "success" / "error" / "no_subtitle" |
| error_message | string | 실패 시 에러 내용 |

#### ManualQueue — 탭: `_manual_queue`

| 필드 | 타입 | 설명 |
|------|------|------|
| url | string | 유튜브 URL |
| category | string | "국감" / "간담회" / "업무보고" / "기타" |
| committee | string | 상임위 또는 기관명 (자유 입력) |
| date | date | 행사 일자 |
| status | enum | "pending" / "processing" / "done" / "error" |

#### Agenda — 탭: `agendas`

| 필드 | 타입 | 설명 |
|------|------|------|
| agenda_id | string (PK) | 자동 생성 (date_committee_순번) |
| video_id | string (FK) | 소속 영상 |
| committee | string | 상임위 |
| date | date | 국감 일자 |
| category | enum | "game" / "general" |
| title | string | 안건 제목 |
| summary | string | 1~2줄 요약 |
| is_company_mentioned | boolean | 자사 직접 언급 여부 |
| company_mention_detail | string | 자사 언급 내용 |
| sort_order | integer | 표시 순서 |

#### Statement — 탭: `statements`

| 필드 | 타입 | 설명 |
|------|------|------|
| statement_id | string (PK) | 자동 생성 |
| agenda_id | string (FK) | 소속 안건 |
| speaker_name | string | 발언자 이름 |
| speaker_party | string | 당적 (민/국/조/진 등) |
| speaker_role | enum | "questioner" / "respondent" |
| content | string | 발언 요약 |
| sort_order | integer | 표시 순서 |

#### NewsArticle — 탭: `news_articles`

| 필드 | 타입 | 설명 |
|------|------|------|
| article_id | string (PK) | 자동 생성 |
| agenda_id | string (FK) | 관련 안건 |
| title | string | 기사 제목 |
| url | string | 기사 URL |
| publisher | string | 언론사명 |
| published_at | date | 게재일 |

### 4.2 관계

```
ProcessedVideo (1) ──▶ (N) Agenda
Agenda (1)         ──▶ (N) Statement
Agenda (1)         ──▶ (N) NewsArticle
```

### 4.3 소유권

| 탭 | 파이프라인 | 프론트엔드 | 담당자 |
|----|-----------|-----------|--------|
| `_processed_videos` | 읽기/쓰기 | 접근 안 함 | 확인만 |
| `_manual_queue` | 읽기/상태 업데이트 | 접근 안 함 | URL 입력 |
| `agendas` | 쓰기 | 읽기 | 보정 가능 |
| `statements` | 쓰기 | 읽기 | 보정 가능 |
| `news_articles` | 쓰기 | 읽기 | 추가/편집 가능 |

---

## 5. User Flows

### Flow 1: 일상 모니터링 (매일)

- **트리거:** 담당자가 국감 당일 또는 익일 아침 대시보드 접속
- **단계:**
  1. 대시보드 메인에서 최신 날짜의 데이터 확인
  2. "게임 관련" 필터로 게임 산업 관련 안건만 확인
  3. 각 안건 클릭 → 질의 의원, 발언 요약, 답변, 관련 기사 확인
  4. ※ 표시된 자사 관련 언급 우선 확인
- **성공 기준:** 게임 관련 발언을 5분 내에 파악 완료
- **에러 처리:**
  - 데이터 없음 → "처리 대기 중입니다" 메시지 + "파이프라인 실행" 버튼 안내
  - Sheets 연결 실패 → "데이터를 불러올 수 없습니다" 메시지

### Flow 2: 파이프라인 즉시 실행

- **트리거:** 담당자가 대시보드 내 "파이프라인 실행" 버튼 클릭
- **단계:**
  1. 버튼 클릭 → 확인 다이얼로그 ("파이프라인을 실행하시겠습니까?")
  2. 확인 → GitHub Actions workflow_dispatch API 호출
  3. "실행이 요청되었습니다. 처리에 약 10~30분 소요됩니다." 메시지 표시
  4. 처리 완료 후 새로고침하면 데이터 확인 가능
- **성공 기준:** 버튼 클릭 후 즉시 파이프라인 시작, 30분 내 결과 반영
- **에러 처리:**
  - API 호출 실패 → "실행 요청에 실패했습니다. 잠시 후 다시 시도해주세요" 메시지

### Flow 3: Slack 보고서 작성

- **트리거:** 담당자가 보고서 생성 버튼 클릭
- **단계:**
  1. 날짜 선택 (기본: 최신), 상임위 선택 (복수 가능, 기본: 전체)
  2. "보고서 생성" 클릭 → 내부 양식으로 포맷팅된 텍스트 미리보기
  3. "클립보드 복사" 클릭 → Slack에 붙여넣기
- **성공 기준:** 보고서 생성~Slack 게시 1분 이내
- **에러 처리:**
  - 데이터 없음 → "해당 날짜의 데이터가 없습니다"
  - 클립보드 실패 → 텍스트 선택 + "Ctrl+C로 복사" 안내

### Flow 4: 키워드 검색

- **트리거:** 검색바에 키워드 입력
- **단계:** 전체 안건+발언에서 매칭 → 날짜/상임위별 그룹핑 표시
- **성공 기준:** 즉시 표시 (클라이언트 사이드 필터링)

### Flow 5: 데이터 수동 보정

- **트리거:** 담당자가 Sheets에서 직접 행 수정
- **성공 기준:** 페이지 새로고침 시 즉시 반영

### Flow 6: 수동 영상 등록 (spot 이벤트)

- **트리거:** 국감 외 이벤트 발생 (간담회, 업무보고 등)
- **단계:**
  1. `_manual_queue` 탭에 URL/카테고리/기관명/일자 입력, status="pending"
  2. 대시보드에서 "파이프라인 실행" 버튼 클릭 (또는 다음 cron에서 처리)
- **성공 기준:** 버튼 클릭 후 30분 내 처리 완료

### Flow 7: 파이프라인 자동 실행 (백그라운드)

- **트리거:** GitHub Actions cron — 매일 새벽 2시 KST (백업)
- **단계:**
  1. YouTube API로 당일 대상 상임위 영상 검색
  2. `_manual_queue`에서 pending 항목 수집
  3. `_processed_videos`와 대조 → 신규만 필터
  4. 각 영상: yt-dlp 자막 추출 → 키워드 필터 → LLM 정리 → 뉴스 검색 → Sheets 기록
  5. 자막 없는 영상은 status="no_subtitle"로 기록하고 스킵
- **에러 처리:**
  - 영상 없음 → 정상 종료
  - LLM/API 실패 → 3회 재시도 후 error 기록, 다음 영상으로 계속
  - GitHub Actions 실패 → 이메일 알림

---

## 6. API Contracts / Interfaces

### 6.1 외부 API 의존

#### YouTube Data API v3 — 영상 검색

- **엔드포인트:** `GET https://www.googleapis.com/youtube/v3/search`
- **인증:** GCP 서비스 계정
- **파라미터:** `channelId`, `q={상임위명} 국정감사`, `publishedAfter`, `type=video`, `maxResults=10`
- **응답:** `items[].id.videoId`, `items[].snippet.title`, `items[].snippet.publishedAt`

#### yt-dlp — 자막 추출

- **CLI:** `yt-dlp --write-sub --write-auto-sub --sub-lang ko --sub-format vtt --skip-download -o "{video_id}" "{url}"`
- **출력:** `{video_id}.ko.vtt` (속기사) 또는 `{video_id}.ko.auto.vtt` (자동생성)
- **자막 없음:** 파일 미생성 → 해당 영상 스킵

#### LLM API — 텍스트 처리 (추상화 인터페이스)

```python
class LLMClient:
    def process(self, system_prompt: str, user_content: str) -> dict:
        """자막 텍스트 → 구조화된 안건 JSON"""
```

- **초기:** Claude Haiku 4.5 (`$1/$5 per M tokens`, 국감 3주 약 $10~15)
- **전환 가능:** OpenAI GPT, Google Gemini, 사내 on-premise
- **설정:** `config.yaml`에서 `provider`, `model`, `api_key`, `endpoint` 변경

#### Naver Search API — 뉴스 검색

- **엔드포인트:** `GET https://openapi.naver.com/v1/search/news.json`
- **파라미터:** `query`, `display=5`, `sort=date`
- **헤더:** `X-Naver-Client-Id`, `X-Naver-Client-Secret`
- **제한:** 일 25,000회

#### Google Sheets API — 데이터 읽기/쓰기

- **쓰기 (파이프라인):** 서비스 계정으로 인증
- **읽기 (프론트엔드):** API 키로 인증 (읽기 전용)

#### GitHub REST API — 파이프라인 트리거

- **엔드포인트:** `POST https://api.github.com/repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches`
- **헤더:** `Authorization: token {GH_PAT}`
- **Body:** `{ "ref": "main" }`
- **인증:** GitHub Personal Access Token (workflow 권한)

### 6.2 내부 인터페이스

#### Sheets → 프론트엔드 데이터 구조

```javascript
{
  date: "2025-10-23",
  committee: "문화체육관광위원회",
  agendas: [{
    category: "game",
    title: "게임산업 성장 및 세제·인재 육성 지원",
    summary: "...",
    isCompanyMentioned: true,
    companyMentionDetail: "...",
    statements: [{ speakerName, speakerParty, speakerRole, content }],
    newsArticles: [{ title, url, publisher }]
  }]
}
```

#### 보고서 텍스트 양식

```
안녕하세요. {날짜} 진행된 주요 상임위 국정감사 내용(게임 및 IT 관련) 정리하여 안내드립니다.
• {상임위}: {게임 관련 안건 요약}
자세한 사항은 아래 내용 참고 부탁드립니다. 감사합니다.

• {상임위}({피감기관}): △{안건1}, △{안건2}, ...
1. {안건 제목}
  ○ ({당적}){의원명}: {발언 요약}
※ {자사 관련 내용}

주요 기사
1. {기사 제목}
  ○ {URL}
```

### 6.3 API 키 관리

총 6개. 모두 GitHub Actions Secrets에 저장.

| # | Secret 이름 | 용도 | 발급처 |
|---|------------|------|--------|
| 1 | `GOOGLE_SERVICE_ACCOUNT_JSON` | YouTube API + Sheets 쓰기 | GCP Console |
| 2 | `SHEETS_API_KEY` | 프론트엔드 Sheets 읽기 | GCP Console |
| 3 | `ANTHROPIC_API_KEY` | Claude Haiku LLM | Anthropic Console |
| 4 | `NAVER_CLIENT_ID` | 뉴스 검색 | Naver Developers |
| 5 | `NAVER_CLIENT_SECRET` | 뉴스 검색 | Naver Developers |
| 6 | `GH_PAT` | 대시보드 → workflow_dispatch 트리거 | GitHub Settings |

발급처는 4곳: GCP, Anthropic, Naver Developers, GitHub.

---

## 7. Technical Decisions

### TD1: 프론트엔드 — 정적 HTML + Vanilla JS

- **결정:** React/Vue 없이 index.html + app.js + styles.css
- **이유:** prompt-library에서 검증된 패턴, 빌드 불필요, 비개발자 유지보수 용이
- **트레이드오프:** 컴포넌트 재사용성 없음. 이 규모에서는 문제없음

### TD2: 데이터 저장소 — Google Sheets

- **결정:** Sheets가 유일한 데이터 저장소
- **이유:** DB 서버 불필요, 무료, 비개발자가 직접 보정 가능
- **트레이드오프:** 수백 행 수준이라 성능 문제없음

### TD3: 파이프라인 실행 — GitHub Actions (cron + 수동 트리거)

- **결정:** 백업 cron(새벽 2시 KST) + 대시보드 내 즉시 트리거 버튼
- **이유:** cron은 딜레이가 있어 당일 보고에 부적합. 담당자가 원하는 시점에 즉시 실행하는 버튼이 실무에 맞음. cron은 버튼 누르는 것을 잊었을 때의 안전망
- **트레이드오프:** GitHub PAT이 프론트엔드에 노출됨 (URL obscurity 정책으로 허용)

### TD4: STT — 유튜브 자막만 사용 (Whisper 폴백 없음)

- **결정:** yt-dlp로 속기사/자동생성 자막 추출. 자막 없는 영상은 스킵
- **이유:** 국회방송 유튜브 영상에 자막이 항상 제공됨 (속기사 또는 자동생성). API 키 1개 절약, 파이프라인 단순화
- **트레이드오프:** 자막 없는 영상 발생 시 커버리지 갭. 필요하면 향후 Whisper 추가 가능 (추상화 구조 유지)

### TD5: LLM — Claude Haiku 4.5 (교체 가능)

- **결정:** 초기 Claude Haiku 4.5, 추상화 레이어로 교체 가능
- **이유:** $1/$5 per M tokens, 국감 3주 약 $10~15. 사내 on-premise 제공 시 전환
- **트레이드오프:** 모델 전환 시 프롬프트 튜닝 + 2~3일 검증 필요

### TD6: 뉴스 검색 — Naver Search API

- **결정:** Naver 뉴스 검색으로 안건별 기사 매칭
- **이유:** 한국어 뉴스 커버리지 최고
- **트레이드오프:** API 키 추가 관리

### TD7: 파이프라인 입력 — 자동 + 수동 2트랙

- **결정:** 국감 자동 감지 + `_manual_queue` Sheets 탭으로 수동 URL 입력
- **이유:** Sheets URL 한 줄 붙여넣기면 충분, 별도 UI 불필요
- **트레이드오프:** 수동 입력은 트리거 버튼 누르거나 다음 cron까지 대기

---

## 8. Testing Strategy

### 파이프라인 테스트

**단위 테스트:**
- 자막 추출기: 속기사 자막/자동생성 자막/자막 없음 각 케이스
- 키워드 필터: 긍정 케이스 + "게임 체인저" 같은 오매칭 부정 케이스
- LLM 처리기: 내부 양식 샘플 3~4건을 golden test로 구조 검증
- 뉴스 검색기: 안건 기반 검색 결과 관련성 수동 확인
- Sheets 기록기: 테스트 Sheets에 쓰기 후 무결성 검증

**통합 테스트:**
- 과거 국감 영상 1개 end-to-end (영상 → 자막 → LLM → Sheets)
- 결과물을 실제 내부 양식과 비교

**에러 핸들링:**
- 자막 없는 영상 → 스킵 + status="no_subtitle" 기록
- 잘못된 URL → error 기록 후 다음 영상 진행
- API 할당량 초과 → 재시도 + 에러 기록

### 프론트엔드 테스트

수동 검증:
- 대시보드 렌더링, 필터링, 검색
- 보고서 생성 → 클립보드 복사 → Slack 양식 일치
- 파이프라인 실행 버튼 → workflow_dispatch 호출 확인
- 모바일 레이아웃

### 배포 전 체크리스트

- [ ] 전체 테스트 통과
- [ ] 과거 국감 영상 3개 end-to-end 처리
- [ ] Sheets → 대시보드 정상 표시
- [ ] 보고서 텍스트가 내부 양식과 일치 (담당자 확인)
- [ ] 파이프라인 실행 버튼 동작 확인
- [ ] `_manual_queue` URL 입력 → 처리 완료
- [ ] 모든 API 키 GitHub Secrets 등록
- [ ] 모바일 브라우저 확인

---

## 9. Open Questions

| ID | 질문 | 영향 | 해결 시점 |
|----|------|------|----------|
| OQ1 | 국회방송 유튜브 자막 품질 확인 (속기사 vs 자동생성 비율) | STT 품질 | 구현 전 테스트 |
| OQ2 | 국회방송 유튜브 채널 ID 및 구조 (단일/복수 채널) | 영상 감지기 | 구현 전 확인 |
| OQ3 | 국감 영상 제목 패턴 일관성 | 자동 감지 정확도 | 과거 영상 수집 |
| OQ4 | 사내 on-premise LLM 제공 시점 및 API 방식 | LLM 전환 | 사내 확인 |
| OQ5 | GitHub Actions에서 사내 on-premise LLM 접근 가능 여부 | 실행 환경 | 전환 시 판단 |
| OQ6 | 내부 보고 양식 세부 규칙 (당적 표기, △/※ 기준) | 보고서 정확도 | 담당자 확인 |

---

## 10. Future Considerations

| ID | 기능 | 설명 | 난이도 |
|----|------|------|--------|
| FC1 | Slack 봇 자동 발송 | Webhook으로 파이프라인 완료 시 자동 발송 | 낮음 |
| FC2 | 국감 외 상시 모니터링 | 자동 트랙 검색 확장으로 상시 도구화 | 중간 |
| FC3 | 키워드 알림 | 특정 키워드 감지 시 알림 | 낮음 |
| FC4 | 과거 국감 아카이브 | 국회도서관 발언 빅데이터 연동 | 중간 |
| FC5 | Whisper STT 추가 | 자막 없는 영상 대응 (필요 시) | 낮음 |
| FC6 | 발언자 자동 식별 | 열린국회정보 API 의원 DB 연동 | 중간 |
| FC7 | 다기업/다산업 지원 | 키워드 세트 분리로 범용화 | 높음 |

