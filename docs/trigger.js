/**
 * GamWatch 파이프라인 트리거 + 수동 영상 분석 요청.
 */

// ──────────────────────────────────────────────
// 전체 파이프라인 실행
// ──────────────────────────────────────────────

async function triggerPipeline() {
  if (!_checkGitHubConfig()) return;
  if (!confirm('전체 파이프라인을 실행하시겠습니까?\n(대상 상임위 영상 자동 검색 + 수동 큐 처리)')) return;

  const btn = document.getElementById('btn-trigger');
  btn.disabled = true;
  btn.textContent = '실행 요청 중...';

  try {
    const success = await _dispatchWorkflow({});
    if (success) {
      showNotification('실행이 요청되었습니다. 처리에 약 10~30분 소요됩니다.', 'success');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = '전체 파이프라인 실행';
  }
}

// ──────────────────────────────────────────────
// 수동 영상 분석 모달
// ──────────────────────────────────────────────

function openManualModal() {
  document.getElementById('manual-modal').style.display = 'flex';
  // 기본 날짜: 오늘
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('manual-date').value = today;
}

function closeManualModal() {
  document.getElementById('manual-modal').style.display = 'none';
}

async function submitManualVideo() {
  if (!_checkGitHubConfig()) return;

  const url = document.getElementById('manual-url').value.trim();
  const committee = document.getElementById('manual-committee').value;
  const date = document.getElementById('manual-date').value;

  if (!url) {
    showNotification('유튜브 URL을 입력해 주세요.', 'error');
    return;
  }

  // 유튜브 URL 형식 간단 검증
  if (!url.includes('youtube.com/') && !url.includes('youtu.be/')) {
    showNotification('올바른 유튜브 URL을 입력해 주세요.', 'error');
    return;
  }

  // 상임위 코드 매핑
  const codeMap = {
    '정무위원회': 'jungmu',
    '과학기술정보방송통신위원회': 'gwabang',
    '문화체육관광위원회': 'munche',
    '산업통상자원중소벤처기업위원회': 'sanja',
    '법제사법위원회': 'beopsa',
    '보건복지위원회': 'bokji',
  };

  const inputs = {
    video_url: url,
    committee: committee,
    committee_code: codeMap[committee] || 'etc',
    event_date: date,
  };

  const success = await _dispatchWorkflow(inputs);
  if (success) {
    showNotification(
      `영상 분석이 요청되었습니다.\n처리에 약 10~30분 소요됩니다.`,
      'success',
    );
    closeManualModal();
    // 입력 초기화
    document.getElementById('manual-url').value = '';
    document.getElementById('manual-committee').value = '';
  }
}

// ──────────────────────────────────────────────
// 공통: workflow_dispatch API 호출
// ──────────────────────────────────────────────

function _checkGitHubConfig() {
  if (!CONFIG.GH_PAT || !CONFIG.GH_OWNER) {
    showNotification('GitHub 설정이 완료되지 않았습니다. config.js를 확인해 주세요.', 'error');
    return false;
  }
  return true;
}

async function _dispatchWorkflow(inputs) {
  const apiUrl = `https://api.github.com/repos/${CONFIG.GH_OWNER}/${CONFIG.GH_REPO}/actions/workflows/${CONFIG.GH_WORKFLOW_ID}/dispatches`;

  try {
    const body = { ref: 'master' };
    if (inputs && Object.keys(inputs).length > 0) {
      body.inputs = inputs;
    }

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `token ${CONFIG.GH_PAT}`,
        'Accept': 'application/vnd.github.v3+json',
      },
      body: JSON.stringify(body),
    });

    if (res.status === 204) {
      return true;
    } else {
      const errText = await res.text();
      console.error('Dispatch failed:', res.status, errText);
      showNotification('실행 요청에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
      return false;
    }
  } catch (e) {
    console.error('Dispatch error:', e);
    showNotification('실행 요청에 실패했습니다. 네트워크를 확인해 주세요.', 'error');
    return false;
  }
}
