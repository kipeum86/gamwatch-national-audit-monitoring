/**
 * GamWatch 대시보드 설정.
 * GitHub Pages 배포 전에 아래 값들을 실제 값으로 교체하세요.
 */
const CONFIG = {
  // Google Sheets
  SPREADSHEET_ID: '1IG3GWc4kChVmjYxsPw_NX3gUlKj_ehOFgOMh3RqJPRY',
  SHEETS_API_KEY: 'AIzaSyANCUUWh4ckh52L37haIOPLjC007yihCyw',

  // GitHub Actions 트리거
  GH_OWNER: 'kipeum86',
  GH_REPO: 'gamwatch-national-audit-monitoring',
  GH_WORKFLOW_ID: 'pipeline.yml',
  GH_PAT: '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',

  // Sheets 탭 이름
  TABS: {
    AGENDAS: 'agendas',
    STATEMENTS: 'statements',
    NEWS_ARTICLES: 'news_articles',
  },
};
