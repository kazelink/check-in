// 数据仓库：localStorage 即时缓存 + 服务端（D1）防抖同步。
// 服务端是主数据源；断网时回退本地缓存，恢复后自动补同步。

import { S } from './ctx.js';
import { authedFetch, hasSession } from './auth.js';
import { toast } from './ui.js';

const KEY = 'checkin-data-v1';
const SYNC_DEBOUNCE_MS = 800;

export function emptyState() {
  return { fixed: [], recs: {}, plans: {}, range: { s: 7, e: 23 }, lastT: 'w' };
}

// 把任意历史版本的数据归一化成当前结构（含单文件旧版的迁移）
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

  return {
    fixed: d.fixed || d.items || [],
    recs: d.recs || {},
    plans,
    range: d.range || { s: 7, e: 23 },
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
  } catch { /* 隐私模式等场景下写入失败不致命 */ }
}

let dirty = false;
let syncTimer = null;

// 所有数据变更统一走这里：先落本地，再防抖同步到服务端
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
    dirty = true; // 断网：保持脏标记，由定时器/可见性变化重试
  }
}

// 读取服务端状态；401 抛 { unauth: true }，网络错误抛原错误
export async function fetchRemote() {
  const res = await authedFetch('/api/state');
  if (res.status === 401) throw { unauth: true };
  if (!res.ok) throw new Error('state fetch failed');
  const json = await res.json();
  return json.state;
}

// 启动/重新登录时对齐服务端：远端有数据用远端，远端为空则把本地迁移上去
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
