// DOSL HUB 共通APIクライアント
const API_BASE = '';  // 同一オリジン配信

function getUser() {
  try { return JSON.parse(sessionStorage.getItem('doslhub_user') || 'null'); }
  catch { return null; }
}
function setAuth(user) {
  sessionStorage.setItem('doslhub_user', JSON.stringify(user));
}
function clearAuth() {
  sessionStorage.removeItem('doslhub_user');
  localStorage.removeItem('doslhub_user');
  // 旧版が保存したJWTをアップグレード時に破棄する。
  localStorage.removeItem(['doslhub', 'token'].join('_'));
}
async function logout() {
  try {
    await fetch(API_BASE + '/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
    });
  } finally {
    clearAuth();
    location.href = 'login.html';
  }
}

// ログイン必須ページの入口で呼ぶ。未ログインならログイン画面へ
function requireAuth(allowedRoles) {
  const user = getUser();
  if (!user) {
    location.href = 'login.html';
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    location.href = user.role === 'exhibitor' ? 'index.html' : 'admin.html';
    return null;
  }
  return user;
}

async function api(path, options = {}) {
  const { skipAuthRedirect = false, ...fetchOptions } = options;
  const headers = fetchOptions.headers || {};
  if (fetchOptions.body && !(fetchOptions.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    fetchOptions.body = JSON.stringify(fetchOptions.body);
  }
  const res = await fetch(API_BASE + path, {
    ...fetchOptions,
    headers,
    credentials: 'same-origin',
  });
  if (res.status === 401 && !skipAuthRedirect) {
    clearAuth();
    location.href = 'login.html';
    throw new Error('認証が切れました');
  }
  if (!res.ok) {
    let detail = 'エラーが発生しました (' + res.status + ')';
    try { detail = (await res.json()).detail || detail; } catch {}
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

// 認証付きファイルダウンロード（別タブで開けないためblob経由）
async function apiDownload(path, fallbackName) {
  const res = await fetch(API_BASE + path, {
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error('ダウンロードに失敗しました');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fallbackName || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ステータス表示（出展社向け/管理側共通）
const STATUS_LABELS = {
  received: { text: '受信済', cls: 'status-received' },
  processing: { text: 'AI解析中', cls: 'status-received' },
  analyzed: { text: '解析済', cls: 'status-confirmed' },
  review_needed: { text: '要レビュー', cls: 'status-review' },
  confirmed: { text: '確認済', cls: 'status-confirmed' },
  error: { text: '差し戻し', cls: 'status-error' },
  analysis_failed: { text: '解析失敗', cls: 'status-error' },
};
function statusChip(status) {
  const s = STATUS_LABELS[status] || { text: status, cls: 'status-received' };
  return '<span class="chip-status ' + s.cls + '">' + escapeHtml(s.text) + '</span>';
}
function statusChipElement(status) {
  const s = STATUS_LABELS[status] || { text: status, cls: 'status-received' };
  const chip = document.createElement('span');
  chip.className = 'chip-status ' + s.cls;
  chip.textContent = s.text;
  return chip;
}

// 受信経路の表示名（web_upload / camera_capture / email）
const SOURCE_CHANNEL_LABELS = {
  web_upload: 'Web',
  camera_capture: 'カメラ',
  email: 'メール',
};
function sourceChannelLabel(channel) {
  return SOURCE_CHANNEL_LABELS[channel] || channel || '';
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDateTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
}

function formatYen(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('ja-JP') + '円';
}
