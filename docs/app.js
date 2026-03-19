/**
 * GamWatch 대시보드 — 데이터 fetch, 렌더링, 필터, 검색.
 */

// 전역 데이터 저장소
let allAgendas = [];
let allStatements = [];
let allNewsArticles = [];
let dataModel = []; // 안건 기준 join된 최종 모델
let allExpanded = false;
const LOAD_MORE_SIZE = 10;
let _currentFiltered = [];
let _currentSearch = '';
let _visibleGroups = 0;

// ──────────────────────────────────────────────
// 유틸: Sheets 날짜 시리얼 넘버 → YYYY-MM-DD 변환
// ──────────────────────────────────────────────

function _fixDate(val) {
  if (!val) return val;
  // 이미 YYYY-MM-DD 형식이면 그대로
  if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val.slice(0, 10);
  // 숫자(Excel 시리얼 넘버)이면 변환
  const num = Number(val);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    const d = new Date((num - 25569) * 86400000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return val;
}

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
    date: _fixDate(a.date),
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
  if (reportDate) {
    dates.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      reportDate.appendChild(opt);
    });
  }

  const reportComm = document.getElementById('report-committee');
  if (reportComm) {
    committees.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      reportComm.appendChild(opt);
    });
  }
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

  // 게임 토글 버튼 동기화
  const gameToggle = document.getElementById('btn-game-toggle');
  if (gameToggle) gameToggle.classList.toggle('active', category === 'game');

  updateStats(filtered);
  renderAgendas(filtered, search);
}

// ──────────────────────────────────────────────
// 렌더링
// ──────────────────────────────────────────────

function renderAgendas(agendas, searchTerm) {
  // 필터 변경 시 초기화
  _currentFiltered = agendas;
  _currentSearch = searchTerm;
  _visibleGroups = 0;

  const container = document.getElementById('agenda-list');
  const emptyState = document.getElementById('empty-state');

  if (agendas.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = 'block';
    _hideLoadMore();
    return;
  }

  emptyState.style.display = 'none';
  container.innerHTML = '';

  // 처음 10개 그룹 렌더링
  _loadMoreGroups();

  // 툴바 표시 + 상태 리셋
  document.getElementById('agenda-toolbar').style.display = agendas.length ? 'flex' : 'none';
  allExpanded = false;
  document.getElementById('btn-toggle-all').textContent = '모두 펼치기';
}

function _getGroupedKeys() {
  const groups = {};
  _currentFiltered.forEach(a => {
    const key = `${a.date}__${a.committee}`;
    if (!groups[key]) groups[key] = { date: a.date, committee: a.committee, agendas: [] };
    groups[key].agendas.push(a);
  });
  return { groups, sortedKeys: Object.keys(groups).sort().reverse() };
}

function _loadMoreGroups() {
  const container = document.getElementById('agenda-list');
  const { groups, sortedKeys } = _getGroupedKeys();
  const totalGroups = sortedKeys.length;
  const end = Math.min(_visibleGroups + LOAD_MORE_SIZE, totalGroups);

  for (let i = _visibleGroups; i < end; i++) {
    const key = sortedKeys[i];
    const g = groups[key];
    const isFirst = i === 0 && _visibleGroups === 0;
    const collapsedClass = isFirst ? '' : 'collapsed';
    const chevron = isFirst ? '&#9660;' : '&#9654;';

    const div = document.createElement('div');
    div.innerHTML = `
      <div class="date-group ${collapsedClass}">
        <div class="date-group-header" onclick="toggleDateGroup(this)">
          <span class="date-group-chevron">${chevron}</span>
          ${g.date} <span class="committee-label">${g.committee}</span>
          <span class="date-group-count">(${g.agendas.length}건)</span>
        </div>
        <div class="date-group-body">
          ${g.agendas.map(a => renderAgendaCard(a, _currentSearch)).join('')}
        </div>
      </div>
    `;
    container.appendChild(div.firstElementChild);
  }

  _visibleGroups = end;

  // 더보기 버튼 업데이트
  const remaining = totalGroups - _visibleGroups;
  if (remaining > 0) {
    _showLoadMore(remaining);
  } else {
    _hideLoadMore();
  }
}

function _showLoadMore(remaining) {
  const btn = document.getElementById('btn-load-more');
  if (btn) {
    btn.textContent = `더보기 (${remaining}개 그룹 남음)`;
    btn.style.display = 'block';
  }
}

function _hideLoadMore() {
  const btn = document.getElementById('btn-load-more');
  if (btn) btn.style.display = 'none';
}

function loadMore() {
  _loadMoreGroups();
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
        ${agenda.event_type && agenda.event_type !== '국정감사' ? `<span class="agenda-badge event-type">${agenda.event_type}</span>` : ''}
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

function toggleDateGroup(headerEl) {
  const group = headerEl.closest('.date-group');
  group.classList.toggle('collapsed');
  const chevron = headerEl.querySelector('.date-group-chevron');
  chevron.innerHTML = group.classList.contains('collapsed') ? '&#9654;' : '&#9660;';
}

function toggleAllDetails() {
  allExpanded = !allExpanded;
  document.querySelectorAll('.agenda-detail').forEach(d => {
    d.classList.toggle('open', allExpanded);
  });
  document.querySelectorAll('.date-group').forEach(g => {
    g.classList.toggle('collapsed', !allExpanded);
    const chevron = g.querySelector('.date-group-chevron');
    if (chevron) chevron.innerHTML = allExpanded ? '&#9660;' : '&#9654;';
  });
  document.getElementById('btn-toggle-all').textContent = allExpanded ? '모두 접기' : '모두 펼치기';
}

function updateStats(filtered) {
  const bar = document.getElementById('stats-bar');
  bar.style.display = filtered.length ? 'flex' : 'none';
  document.getElementById('stats-total').textContent = `전체 ${filtered.length}건`;
  const gameCount = filtered.filter(a => a.category === 'game').length;
  document.getElementById('stats-game').textContent = `게임 관련 ${gameCount}건`;
  const companyCount = filtered.filter(a => a.isCompanyMentioned).length;
  document.getElementById('stats-company').textContent = `게임사 언급 ${companyCount}건`;
}

async function refreshData() {
  const btn = document.getElementById('btn-refresh');
  btn.disabled = true;
  showNotification('새로고침 중...', 'info');
  try {
    await loadAllData();
    buildDataModel();
    resetFilterOptions();
    populateFilters();
    applyFilters();
    document.getElementById('last-updated').textContent =
      `마지막 로드: ${new Date().toLocaleString('ko-KR')}`;
    showNotification('새로고침 완료', 'success');
  } catch (e) {
    showNotification('새로고침 실패', 'error');
    console.error('Refresh error:', e);
  } finally {
    btn.disabled = false;
  }
}

function resetFilterOptions() {
  ['filter-date', 'filter-committee', 'report-date'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    while (sel.options.length > 1) sel.remove(1);
  });
  const reportComm = document.getElementById('report-committee');
  if (reportComm) {
    while (reportComm.options.length > 1) reportComm.remove(1);
  }
}

function toggleGameFilter() {
  const select = document.getElementById('filter-category');
  select.value = select.value === 'game' ? '' : 'game';
  applyFilters();
}

function resetFilters() {
  document.getElementById('filter-date').value = '';
  document.getElementById('filter-committee').value = '';
  document.getElementById('filter-category').value = '';
  document.getElementById('filter-search').value = '';
  const gameToggle = document.getElementById('btn-game-toggle');
  if (gameToggle) gameToggle.classList.remove('active');
  applyFilters();
}

// ── 맨 위로 버튼 ──

window.addEventListener('scroll', function() {
  const btn = document.getElementById('btn-scroll-top');
  if (window.scrollY > 300) {
    btn.classList.add('visible');
  } else {
    btn.classList.remove('visible');
  }
});

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showNotification(message, type) {
  type = type || 'info';
  const el = document.getElementById('notification');
  el.textContent = message;
  el.className = `notification ${type}`;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 5000);
}
