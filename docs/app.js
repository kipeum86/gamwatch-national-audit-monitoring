/**
 * GamWatch 대시보드 — 데이터 fetch, 렌더링, 필터, 검색.
 */

// 전역 데이터 저장소
let allAgendas = [];
let allStatements = [];
let allNewsArticles = [];
let dataModel = []; // 안건 기준 join된 최종 모델

// ──────────────────────────────────────────────
// 초기화
// ──────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    await loadAllData();
    buildDataModel();
    populateFilters();
    applyFilters();
    document.getElementById('loading').style.display = 'none';
    document.getElementById('last-updated').textContent =
      `마지막 로드: ${new Date().toLocaleString('ko-KR')}`;
  } catch (e) {
    document.getElementById('loading').textContent =
      '데이터를 불러올 수 없습니다. 설정을 확인해 주세요.';
    console.error('Init error:', e);
  }
}

// ──────────────────────────────────────────────
// 데이터 로드
// ──────────────────────────────────────────────

async function loadAllData() {
  const [agendas, statements, news] = await Promise.all([
    fetchSheetData(CONFIG.TABS.AGENDAS),
    fetchSheetData(CONFIG.TABS.STATEMENTS),
    fetchSheetData(CONFIG.TABS.NEWS_ARTICLES),
  ]);
  allAgendas = agendas;
  allStatements = statements;
  allNewsArticles = news;
}

async function fetchSheetData(tabName) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${tabName}?key=${CONFIG.SHEETS_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sheets API 오류: ${res.status}`);
  const data = await res.json();
  const rows = data.values || [];
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] || ''; });
    return obj;
  });
}

// ──────────────────────────────────────────────
// 데이터 모델 구성 (안건 기준 join)
// ──────────────────────────────────────────────

function buildDataModel() {
  const stmtMap = {};
  allStatements.forEach(s => {
    const aid = s.agenda_id;
    if (!stmtMap[aid]) stmtMap[aid] = [];
    stmtMap[aid].push(s);
  });

  const newsMap = {};
  allNewsArticles.forEach(n => {
    const aid = n.agenda_id;
    if (!newsMap[aid]) newsMap[aid] = [];
    newsMap[aid].push(n);
  });

  dataModel = allAgendas.map(a => ({
    ...a,
    statements: (stmtMap[a.agenda_id] || []).sort((x, y) => (x.sort_order || 0) - (y.sort_order || 0)),
    newsArticles: newsMap[a.agenda_id] || [],
    isCompanyMentioned: a.is_company_mentioned === 'TRUE',
  }));

  // sort_order 기준 정렬
  dataModel.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date); // 최신 먼저
    if (a.committee !== b.committee) return a.committee.localeCompare(b.committee);
    return (parseInt(a.sort_order) || 0) - (parseInt(b.sort_order) || 0);
  });
}

// ──────────────────────────────────────────────
// 필터
// ──────────────────────────────────────────────

function populateFilters() {
  const dates = [...new Set(dataModel.map(a => a.date))].sort().reverse();
  const committees = [...new Set(dataModel.map(a => a.committee))].sort();

  const dateSelect = document.getElementById('filter-date');
  dates.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d;
    dateSelect.appendChild(opt);
  });

  const commSelect = document.getElementById('filter-committee');
  committees.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    commSelect.appendChild(opt);
  });

  // 보고서 모달 필터도 동일하게 설정
  const reportDate = document.getElementById('report-date');
  dates.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d;
    reportDate.appendChild(opt);
  });

  const reportComm = document.getElementById('report-committee');
  committees.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    reportComm.appendChild(opt);
  });
}

function applyFilters() {
  const date = document.getElementById('filter-date').value;
  const committee = document.getElementById('filter-committee').value;
  const category = document.getElementById('filter-category').value;
  const search = document.getElementById('filter-search').value.trim().toLowerCase();

  let filtered = dataModel;

  if (date) filtered = filtered.filter(a => a.date === date);
  if (committee) filtered = filtered.filter(a => a.committee === committee);
  if (category) filtered = filtered.filter(a => a.category === category);

  if (search) {
    filtered = filtered.filter(a => {
      const texts = [
        a.title, a.summary, a.company_mention_detail,
        ...a.statements.map(s => `${s.speaker_name} ${s.content}`),
      ].join(' ').toLowerCase();
      return texts.includes(search);
    });
  }

  renderAgendas(filtered, search);
}

// ──────────────────────────────────────────────
// 렌더링
// ──────────────────────────────────────────────

function renderAgendas(agendas, searchTerm) {
  const container = document.getElementById('agenda-list');
  const emptyState = document.getElementById('empty-state');

  if (agendas.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  // 날짜/상임위별 그룹핑
  const groups = {};
  agendas.forEach(a => {
    const key = `${a.date}__${a.committee}`;
    if (!groups[key]) groups[key] = { date: a.date, committee: a.committee, agendas: [] };
    groups[key].agendas.push(a);
  });

  const sortedKeys = Object.keys(groups).sort().reverse();

  container.innerHTML = sortedKeys.map(key => {
    const g = groups[key];
    return `
      <div class="date-group">
        <div class="date-group-header">
          ${g.date} <span class="committee-label">${g.committee}</span>
        </div>
        ${g.agendas.map(a => renderAgendaCard(a, searchTerm)).join('')}
      </div>
    `;
  }).join('');
}

function renderAgendaCard(agenda, searchTerm) {
  const isGame = agenda.category === 'game';
  const isMentioned = agenda.isCompanyMentioned;

  const classes = [
    'agenda-card',
    isGame ? 'game' : '',
    isMentioned ? 'company-mentioned' : '',
  ].filter(Boolean).join(' ');

  const title = highlightText(agenda.title, searchTerm);
  const summary = highlightText(agenda.summary, searchTerm);

  return `
    <div class="${classes}" onclick="toggleDetail(this)">
      <div class="agenda-header">
        <span class="agenda-badge ${agenda.category}">${isGame ? '게임' : '일반'}</span>
        <span class="agenda-title">${title}</span>
      </div>
      <div class="agenda-summary">${summary}</div>
      <div class="agenda-meta">${agenda.committee} · ${agenda.date}</div>
      <div class="agenda-detail">
        ${isMentioned ? `<div class="company-highlight">${highlightText(agenda.company_mention_detail, searchTerm)}</div>` : ''}
        ${renderStatements(agenda.statements, searchTerm)}
        ${renderNews(agenda.newsArticles)}
      </div>
    </div>
  `;
}

function renderStatements(statements, searchTerm) {
  if (!statements.length) return '';
  return statements.map(s => {
    const roleLabel = s.speaker_role === 'questioner' ? '질의' : '답변';
    const party = s.speaker_party ? `(${s.speaker_party})` : '';
    return `
      <div class="statement">
        <span class="statement-speaker">${party}${highlightText(s.speaker_name, searchTerm)}</span>
        <span class="statement-role ${s.speaker_role}">${roleLabel}</span>
        <div class="statement-content">${highlightText(s.content, searchTerm)}</div>
      </div>
    `;
  }).join('');
}

function renderNews(articles) {
  if (!articles.length) return '';
  return `
    <div class="news-section">
      <div class="news-section-title">관련 기사</div>
      ${articles.map(n => `
        <div class="news-item">
          <a href="${escapeHtml(n.url)}" target="_blank" rel="noopener">${escapeHtml(n.title)}</a>
          <span class="news-publisher">${escapeHtml(n.publisher)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

// ──────────────────────────────────────────────
// UI 헬퍼
// ──────────────────────────────────────────────

function toggleDetail(card) {
  const detail = card.querySelector('.agenda-detail');
  if (detail) detail.classList.toggle('open');
}

function highlightText(text, searchTerm) {
  if (!text || !searchTerm) return escapeHtml(text || '');
  const escaped = escapeHtml(text);
  const regex = new RegExp(`(${escapeRegex(searchTerm)})`, 'gi');
  return escaped.replace(regex, '<mark>$1</mark>');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function showNotification(message, type) {
  type = type || 'info';
  const el = document.getElementById('notification');
  el.textContent = message;
  el.className = `notification ${type}`;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 5000);
}
