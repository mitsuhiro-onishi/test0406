// DOSL HUB 共通APIクライアント
const API_BASE = '';  // 同一オリジン配信

function getToken() { return localStorage.getItem('doslhub_token'); }
function getUser() {
  try { return JSON.parse(localStorage.getItem('doslhub_user') || 'null'); }
  catch { return null; }
}
function setAuth(token, user) {
  localStorage.setItem('doslhub_token', token);
  localStorage.setItem('doslhub_user', JSON.stringify(user));
}
function clearAuth() {
  localStorage.removeItem('doslhub_token');
  localStorage.removeItem('doslhub_user');
}
function logout() {
  clearAuth();
  location.href = 'login.html';
}

// ログイン必須ページの入口で呼ぶ。未ログインならログイン画面へ
function requireAuth(allowedRoles) {
  const user = getUser();
  if (!getToken() || !user) {
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
  const headers = options.headers || {};
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const res = await fetch(API_BASE + path, { ...options, headers });
  if (res.status === 401) {
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
    headers: { Authorization: 'Bearer ' + getToken() },
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
};
function statusChip(status) {
  const s = STATUS_LABELS[status] || { text: status, cls: 'status-received' };
  return '<span class="chip-status ' + s.cls + '">' + s.text + '</span>';
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
