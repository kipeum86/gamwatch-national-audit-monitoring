/**
 * GamWatch 파이프라인 트리거 + 상태 모니터링 + 설정.
 */

let _pollTimer = null;
let _pipelineStartTime = null;

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
      _startStatusPolling();
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

  if (!url.includes('youtube.com/') && !url.includes('youtu.be/')) {
    showNotification('올바른 유튜브 URL을 입력해 주세요.', 'error');
    return;
  }

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
    closeManualModal();
    document.getElementById('manual-url').value = '';
    document.getElementById('manual-committee').value = '';
    _startStatusPolling();
  }
}

// ──────────────────────────────────────────────
// 파이프라인 상태 모니터링
// ──────────────────────────────────────────────

function _startStatusPolling() {
  _pipelineStartTime = Date.now();
  _showStatus('running', '파이프라인 시작 요청 중...', '');
  // 첫 체크는 10초 후 (GitHub가 run을 생성하는 데 시간이 걸림)
  setTimeout(() => _pollStatus(), 10000);
  // 이후 15초마다 폴링
  if (_pollTimer) clearInterval(_pollTimer);
  _pollTimer = setInterval(() => _pollStatus(), 15000);
}

async function _pollStatus() {
  try {
    const apiUrl = `https://api.github.com/repos/${CONFIG.GH_OWNER}/${CONFIG.GH_REPO}/actions/workflows/${CONFIG.GH_WORKFLOW_ID}/runs?per_page=1&branch=master`;
    const res = await fetch(apiUrl, {
      headers: {
        'Authorization': `token ${CONFIG.GH_PAT}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!res.ok) return;

    const data = await res.json();
    const run = data.workflow_runs && data.workflow_runs[0];
    if (!run) return;

    const elapsed = _formatElapsed(Date.now() - _pipelineStartTime);
    const runUrl = run.html_url;

    // 상태 매핑
    if (run.status === 'queued') {
      _showStatus('running', '파이프라인 대기 중...', elapsed, runUrl);
    } else if (run.status === 'in_progress') {
      _showStatus('running', '파이프라인 실행 중...', elapsed, runUrl);
    } else if (run.status === 'completed') {
      _stopPolling();
      if (run.conclusion === 'success') {
        _showStatus('success', '파이프라인 완료! 페이지를 새로고침하면 결과를 확인할 수 있습니다.', elapsed, runUrl);
        // 5초 후 자동 새로고침 안내
        setTimeout(() => {
          if (confirm('파이프라인이 완료되었습니다. 페이지를 새로고침할까요?')) {
            location.reload();
          }
        }, 2000);
      } else {
        _showStatus('failed', `파이프라인 실패 (${run.conclusion}). Actions 로그를 확인해 주세요.`, elapsed, runUrl);
      }
    }
  } catch (e) {
    console.error('Status poll error:', e);
  }
}

function _stopPolling() {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
}

function _showStatus(state, text, elapsed, runUrl) {
  const bar = document.getElementById('pipeline-status');
  bar.style.display = 'block';
  bar.className = `pipeline-status ${state}`;

  const iconMap = { running: '\u25F7', success: '\u2714', failed: '\u2718' };
  document.getElementById('pipeline-status-icon').textContent = iconMap[state] || '';
  document.getElementById('pipeline-status-text').textContent = text;
  document.getElementById('pipeline-status-time').textContent = elapsed ? `(${elapsed})` : '';

  const link = document.getElementById('pipeline-status-link');
  if (runUrl) {
    link.href = runUrl;
    link.style.display = 'inline';
  } else {
    link.style.display = 'none';
  }
}

function _formatElapsed(ms) {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}초`;
  const min = Math.floor(sec / 60);
  const remainSec = sec % 60;
  return `${min}분 ${remainSec}초`;
}

// 페이지 로드 시 진행 중인 파이프라인이 있으면 표시
async function _checkActiveRun() {
  if (!CONFIG.GH_PAT) return;
  try {
    const apiUrl = `https://api.github.com/repos/${CONFIG.GH_OWNER}/${CONFIG.GH_REPO}/actions/workflows/${CONFIG.GH_WORKFLOW_ID}/runs?per_page=1&branch=master&status=in_progress`;
    const res = await fetch(apiUrl, {
      headers: {
        'Authorization': `token ${CONFIG.GH_PAT}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.workflow_runs && data.workflow_runs.length > 0) {
      _pipelineStartTime = new Date(data.workflow_runs[0].created_at).getTime();
      _showStatus('running', '파이프라인 실행 중...', _formatElapsed(Date.now() - _pipelineStartTime), data.workflow_runs[0].html_url);
      if (!_pollTimer) {
        _pollTimer = setInterval(() => _pollStatus(), 15000);
      }
    }
  } catch (e) { /* silent */ }
}

document.addEventListener('DOMContentLoaded', () => setTimeout(_checkActiveRun, 2000));

// ──────────────────────────────────────────────
// 공통: workflow_dispatch API 호출
// ──────────────────────────────────────────────

function _checkGitHubConfig() {
  if (!CONFIG.GH_PAT) {
    showNotification('GitHub PAT이 설정되지 않았습니다. ⚙ 설정 버튼에서 입력해 주세요.', 'error');
    openSettingsModal();
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

// ──────────────────────────────────────────────
// 설정 모달
// ──────────────────────────────────────────────

function openSettingsModal() {
  document.getElementById('settings-modal').style.display = 'flex';
  document.getElementById('settings-pat').value = CONFIG.GH_PAT || '';
}

function closeSettingsModal() {
  document.getElementById('settings-modal').style.display = 'none';
}

function saveSettings() {
  const pat = document.getElementById('settings-pat').value.trim();
  if (!pat) {
    showNotification('PAT을 입력해 주세요.', 'error');
    return;
  }
  CONFIG.GH_PAT = pat;
  closeSettingsModal();
  showNotification('설정이 저장되었습니다.', 'success');
}
