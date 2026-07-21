// 本地缓存立即写入 + 云端（D1）防抖同步，服务端为主数据源

import { S } from './ctx.js';
import { authedFetch, hasSession } from './auth.js';
import { toast } from './ui.js';

const KEY = 'checkin-data-v1';
const SYNC_DEBOUNCE_MS = 800;

export function emptyState() {
  return { fixed: [], recs: {}, plans: {}, range: { s: 7, e: 23 }, lastT: 'w' };
}

export function normalize(d) {
  if (!d || typeof d !== 'object') return emptyState();

  const plans = {};
  for (const k in (d.plans || {})) {
    const arr = (d.plans[k] || []).map((p) => ({
      id: p.id,
      s: p.s,
      e: p.e,
      t: p.t || 'w',
      items: (p.items || (p.name ? [p.name] : []))
        .map((x) => typeof x === 'string' ? { n: x, d: 0 } : { n: x.n || '', d: x.d ? 1 : 0 })
        .filter((x) => x.n)
    })).filter((p) => p.items.length);
    if (arr.length) plans[k] = arr;
  }

  // 兜底非法 range（e <= s 会让时间轴渲染不出格子）
  const r = d.range || {};
  const s = Number.isInteger(r.s) ? Math.min(23, Math.max(0, r.s)) : 7;
  const e = Number.isInteger(r.e) ? Math.min(24, Math.max(s + 1, r.e)) : 23;

  return {
    fixed: d.fixed || d.items || [],
    recs: d.recs || {},
    plans,
    range: { s, e },
    lastT: d.lastT || 'w'
  };
}

export function hasContent(d) {
  return Boolean(
    d && (d.fixed.length || Object.keys(d.recs).length || Object.keys(d.plans).length)
  );
}

export function loadLocal() {
  try {
    return normalize(JSON.parse(localStorage.getItem(KEY)));
  } catch {
    return emptyState();
  }
}

export function saveLocal() {
  try {
    localStorage.setItem(KEY, JSON.stringify(S.data));
  } catch { }
}

let dirty = false;
let syncTimer = null;

export function save() {
  saveLocal();
  if (!hasSession()) return;
  dirty = true;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(flush, SYNC_DEBOUNCE_MS);
}

export async function flush() {
  if (!dirty || !hasSession()) return;
  dirty = false;
  try {
    const res = await authedFetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(S.data)
    });
    if (!res.ok) {
      dirty = true;
      if (res.status !== 401) toast('同步失败，已本地保存');
    }
  } catch {
    dirty = true;
  }
}

export async function fetchRemote() {
  const res = await authedFetch('/api/state');
  if (res.status === 401) throw { unauth: true };
  if (!res.ok) throw new Error('state fetch failed');
  const json = await res.json();
  return json.state;
}

// 远端有数据用远端；远端为空且本地有数据则把本地迁移上去
export async function adoptRemote() {
  const remote = await fetchRemote();
  if (remote) {
    S.data = normalize(remote);
    saveLocal();
  } else if (hasContent(S.data)) {
    dirty = true;
    await flush();
  }
}
