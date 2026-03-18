/**
 * GamWatch 보고서 생성기 — 안건 선택 + Slack 브리핑 양식.
 */

function openReportModal() {
  document.getElementById('report-modal').style.display = 'flex';
  document.getElementById('report-preview').style.display = 'none';
  document.getElementById('report-agenda-list').innerHTML = '';
  document.getElementById('report-agenda-actions').style.display = 'none';
  loadReportAgendas();
}

function closeReportModal() {
  document.getElementById('report-modal').style.display = 'none';
}

// ──────────────────────────────────────────────
// 안건 목록 로드 (체크박스)
// ──────────────────────────────────────────────

function loadReportAgendas() {
  const date = document.getElementById('report-date').value;
  const categoryFilter = document.getElementById('report-category').value;
  const listEl = document.getElementById('report-agenda-list');
  const actionsEl = document.getElementById('report-agenda-actions');

  listEl.innerHTML = '';
  actionsEl.style.display = 'none';
  document.getElementById('report-preview').style.display = 'none';

  if (!date) return;

  let agendas = dataModel.filter(a => a.date === date);
  if (categoryFilter === 'game') {
    agendas = agendas.filter(a => a.category === 'game');
  }

  if (agendas.length === 0) {
    listEl.innerHTML = '<p class="report-empty">해당 조건의 안건이 없습니다.</p>';
    return;
  }

  // 상임위별 그룹핑
  const byCommittee = {};
  agendas.forEach(a => {
    if (!byCommittee[a.committee]) byCommittee[a.committee] = [];
    byCommittee[a.committee].push(a);
  });

  let html = '';
  for (const [comm, items] of Object.entries(byCommittee)) {
    html += `<div class="report-comm-group">`;
    html += `<div class="report-comm-header">${comm}</div>`;
    items.forEach(a => {
      const badge = a.category === 'game' ? '<span class="report-badge game">게임</span>' : '';
      const star = a.isCompanyMentioned ? '<span class="report-badge company">★</span>' : '';
      html += `<label class="report-agenda-item">`;
      html += `<input type="checkbox" value="${a.agenda_id}" checked>`;
      html += `<span class="report-agenda-title">${badge}${star}${a.title}</span>`;
      html += `<span class="report-agenda-summary">${a.summary || ''}</span>`;
      html += `</label>`;
    });
    html += `</div>`;
  }

  listEl.innerHTML = html;
  actionsEl.style.display = 'flex';
}

function toggleReportCheckAll() {
  const checkboxes = document.querySelectorAll('#report-agenda-list input[type="checkbox"]');
  const allChecked = Array.from(checkboxes).every(cb => cb.checked);
  checkboxes.forEach(cb => cb.checked = !allChecked);
}

// ──────────────────────────────────────────────
// 보고서 생성
// ──────────────────────────────────────────────

function generateReport() {
  const date = document.getElementById('report-date').value;
  if (!date) {
    showNotification('날짜를 선택해 주세요.', 'error');
    return;
  }

  const checkboxes = document.querySelectorAll('#report-agenda-list input[type="checkbox"]:checked');
  const selectedIds = new Set(Array.from(checkboxes).map(cb => cb.value));

  if (selectedIds.size === 0) {
    showNotification('보고서에 포함할 안건을 선택해 주세요.', 'error');
    return;
  }

  const agendas = dataModel.filter(a => selectedIds.has(a.agenda_id));
  const text = formatReport(date, agendas);

  document.getElementById('report-text').textContent = text;
  document.getElementById('report-preview').style.display = 'block';
  document.getElementById('copy-feedback').textContent = '';
}

// ──────────────────────────────────────────────
// 보고서 양식 (실제 Slack 브리핑 스타일)
// ──────────────────────────────────────────────

function formatReport(date, agendas) {
  const formattedDate = formatDateKorean(date);
  const dateRef = _getDateRef(date);

  // 상임위별 그룹핑
  const byCommittee = {};
  agendas.forEach(a => {
    if (!byCommittee[a.committee]) byCommittee[a.committee] = [];
    byCommittee[a.committee].push(a);
  });

  let report = '';

  // ── 1. 인사말 ──
  report += `안녕하세요. ${dateRef}(${formattedDate}) 진행된 주요 상임위 국정감사 내용(게임 및 IT 관련) 정리하여 안내드립니다.\n\n`;

  // ── 2. 상임위별 요약 (1-2줄) ──
  for (const [comm, items] of Object.entries(byCommittee)) {
    const summaries = items.map(a => a.summary || a.title).join(', ');
    report += `${comm}: ${summaries}\n`;
  }

  report += `\n자세한 사항은 아래 내용 참고 부탁드립니다. 감사합니다.\n\n\n`;

  // ── 3. 상세 내용 ──
  for (const [comm, items] of Object.entries(byCommittee)) {
    // 상임위 헤더 + △안건 목록
    const topicList = items.map(a => `△${a.title}`).join(', ');
    report += `${comm}: ${topicList}\n`;

    items.forEach((agenda, idx) => {
      report += `${idx + 1}. ${agenda.title}\n`;

      // 발언자
      agenda.statements.forEach(s => {
        const party = s.speaker_party ? `(${s.speaker_party})` : '';
        const role = s.speaker_role === 'questioner' ? ' 의원' : '';
        report += ` - ${party}${s.speaker_name}${role}: ${s.content}\n`;
      });

      // 게임사 언급
      if (agenda.isCompanyMentioned && agenda.company_mention_detail) {
        report += `  ※ ${agenda.company_mention_detail}\n`;
      }

      report += '\n';
    });
  }

  // ── 4. 주요 기사 ──
  const allNews = agendas.flatMap(a => a.newsArticles || []);
  if (allNews.length > 0) {
    report += '주요 기사\n';
    allNews.forEach((n, idx) => {
      report += `${idx + 1}. ${n.title}\n`;
      report += ` - ${n.url}\n\n`;
    });
  }

  return report.trimEnd();
}

function _getDateRef(dateStr) {
  const target = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - target) / (1000 * 60 * 60 * 24));
  if (diff === 0) return '금일';
  if (diff === 1) return '어제';
  return '';
}

function formatDateKorean(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const dayName = days[d.getDay()];
  return `${month}/${day}(${dayName})`;
}

async function copyReport() {
  const text = document.getElementById('report-text').textContent;

  try {
    await navigator.clipboard.writeText(text);
    document.getElementById('copy-feedback').textContent = '복사되었습니다!';
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    document.getElementById('copy-feedback').textContent = '복사되었습니다!';
  }

  setTimeout(() => {
    document.getElementById('copy-feedback').textContent = '';
  }, 3000);
}
