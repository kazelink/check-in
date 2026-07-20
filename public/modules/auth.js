import { $ } from './util.js';

const TOKEN_KEY = 'checkin_token';
const NONCE_KEY = 'checkin_nonce';

export const hasSession = () =>
  Boolean(localStorage.getItem(TOKEN_KEY) && localStorage.getItem(NONCE_KEY));

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(NONCE_KEY);
}

let expiredCb = null;
export function onSessionExpired(cb) {
  expiredCb = cb;
}

// 带认证头的 fetch；遇到 401 自动清理会话并通知上层弹出登录
export async function authedFetch(url, opts = {}) {
  const headers = new Headers(opts.headers || {});
  headers.set('X-Auth-Token', localStorage.getItem(TOKEN_KEY) || '');
  headers.set('X-Session-Nonce', localStorage.getItem(NONCE_KEY) || '');

  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401) {
    clearSession();
    if (expiredCb) expiredCb();
  }
  return res;
}

export function showLogin(msg) {
  $('authView').style.display = 'flex';
  $('authMsg').textContent = msg || '';
  requestAnimationFrame(() => $('authInp').focus({ preventScroll: true }));
}

export function hideLogin() {
  $('authView').style.display = 'none';
}

export function initLogin(onSuccess) {
  const form = $('authForm');
  const inp = $('authInp');
  const btn = $('authBtn');
  const msg = $('authMsg');

  inp.addEventListener('input', () => { msg.textContent = ''; });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const password = inp.value;
    if (!password.trim()) return;

    btn.disabled = true;
    btn.textContent = '···';
    msg.textContent = '';

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        msg.textContent = json.error || '登录失败';
        inp.value = '';
        inp.focus();
        return;
      }

      localStorage.setItem(TOKEN_KEY, json.token);
      localStorage.setItem(NONCE_KEY, json.nonce);
      inp.value = '';
      hideLogin();
      await onSuccess();
    } catch {
      msg.textContent = '网络错误，请重试';
    } finally {
      btn.disabled = false;
      btn.textContent = '进入';
    }
  };
}

export function logout() {
  clearSession();
  location.reload();
}
