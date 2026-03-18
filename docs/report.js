/**
 * GamWatch 보고서 생성기 — Slack 보고 양식 텍스트 생성 + 클립보드 복사.
 */

function openReportModal() {
  document.getElementById('report-modal').style.display = 'flex';
  document.getElementById('report-preview').style.display = 'none';
}

function closeReportModal() {
  document.getElementById('report-modal').style.display = 'none';
}

function generateReport() {
  const date = document.getElementById('report-date').value;
  const commSelect = document.getElementById('report-committee');
  const selectedComms = Array.from(commSelect.selectedOptions)
    .map(o => o.value)
    .filter(v => v !== '');

  if (!date) {
    showNotification('날짜를 선택해 주세요.', 'error');
    return;
  }

  const categoryFilter = document.getElementById('report-category').value;

  // 해당 날짜 안건 필터
  let agendas = dataModel.filter(a => a.date === date);
  if (categoryFilter === 'game') {
    agendas = agendas.filter(a => a.category === 'game');
  }
  if (selectedComms.length > 0) {
    agendas = agendas.filter(a => selectedComms.includes(a.committee));
  }

  if (agendas.length === 0) {
    const msg = categoryFilter === 'game'
      ? '해당 날짜의 게임 관련 데이터가 없습니다. "전체 안건"으로 시도해 보세요.'
      : '해당 날짜의 데이터가 없습니다.';
    showNotification(msg, 'error');
    return;
  }

  const text = formatReport(date, agendas, categoryFilter);
  const previewEl = document.getElementById('report-preview');
  document.getElementById('report-text').textContent = text;
  previewEl.style.display = 'block';
  document.getElementById('copy-feedback').textContent = '';
}

function formatReport(date, agendas, categoryFilter) {
  const formattedDate = formatDateKorean(date);

  // 상임위별 그룹핑
  const byCommittee = {};
  agendas.forEach(a => {
    if (!byCommittee[a.committee]) byCommittee[a.committee] = [];
    byCommittee[a.committee].push(a);
  });

  let report = '';

  // ── 인사말 + 요약 ──
  const scopeLabel = categoryFilter === 'game' ? '게임 및 IT 관련' : '주요 안건';
  report += `안녕하세요. ${formattedDate} 진행된 주요 상임위 국정감사 내용(${scopeLabel}) 정리하여 안내드립니다.\n`;

  for (const [comm, items] of Object.entries(byCommittee)) {
    const titles = items.map(a => a.title).join(', ');
    report += `• ${comm}: ${titles}\n`;
  }
  report += `자세한 사항은 아래 내용 참고 부탁드립니다. 감사합니다.\n\n`;

  // ── 상세 내용 ──
  for (const [comm, items] of Object.entries(byCommittee)) {
    const agendaTitles = items.map(a => `△${a.title}`).join(', ');
    report += `• ${comm}: ${agendaTitles}\n`;

    items.forEach((agenda, idx) => {
      report += `${idx + 1}. ${agenda.title}\n`;

      // 발언자
      agenda.statements.forEach(s => {
        const party = s.speaker_party ? `(${s.speaker_party})` : '';
        const prefix = s.speaker_role === 'questioner' ? '○' : '  -';
        report += `  ${prefix} ${party}${s.speaker_name}: ${s.content}\n`;
      });

      // 게임사 언급
      if (agenda.isCompanyMentioned && agenda.company_mention_detail) {
        report += `※ ${agenda.company_mention_detail}\n`;
      }

      report += '\n';
    });
  }

  // ── 주요 기사 ──
  const allNews = agendas.flatMap(a => a.newsArticles || []);
  if (allNews.length > 0) {
    report += '주요 기사\n';
    allNews.forEach((n, idx) => {
      report += `${idx + 1}. ${n.title}\n`;
      report += `  ○ ${n.url}\n`;
    });
  }

  return report;
}

function formatDateKorean(dateStr) {
  // "2026-10-23" → "10월 23일(금)"
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const dayName = days[d.getDay()];
  return `${month}월 ${day}일(${dayName})`;
}

async function copyReport() {
  const text = document.getElementById('report-text').textContent;

  try {
    await navigator.clipboard.writeText(text);
    document.getElementById('copy-feedback').textContent = '복사되었습니다!';
  } catch {
    // 폴백: textarea 선택
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
