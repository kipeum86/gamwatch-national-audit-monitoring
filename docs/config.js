/**
 * GamWatch 대시보드 설정.
 * GitHub Pages 배포 전에 아래 값들을 실제 값으로 교체하세요.
 */
const CONFIG = {
  // Google Sheets
  SPREADSHEET_ID: '',           // Google Spreadsheet ID (URL에서 추출)
  SHEETS_API_KEY: '',           // GCP Console에서 발급한 API 키 (Sheets 읽기 전용)

  // GitHub Actions 트리거
  GH_OWNER: '',                 // GitHub 사용자/조직명
  GH_REPO: 'gamwatch-national-audit-monitoring',
  GH_WORKFLOW_ID: 'pipeline.yml',
  GH_PAT: '',                   // GitHub PAT (workflow scope만)

  // Sheets 탭 이름
  TABS: {
    AGENDAS: 'agendas',
    STATEMENTS: 'statements',
    NEWS_ARTICLES: 'news_articles',
  },
};
