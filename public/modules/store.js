
import { S } from './ctx.js';
import { authedFetch, hasSession } from './auth.js';
import { genId } from './util.js';
import { toast } from './ui.js';

const KEY = 'checkin-data-v1';
const SYNC_DEBOUNCE_MS = 800;

/** @typedef {{ id: string, t: string, h: string, u: number }} Note */
/** @typedef {{ id?: string, s: number, e: number, t: string, items: { n: string, d: number }[] }} PlanBlock */
/** @typedef {{ notes: Note[], plans: Record<string, PlanBlock[]>, range: { s: number, e: number }, lastT: string }} AppState */

/** @returns {AppState} */
export function emptyState() {
  return { notes: [], plans: {}, range: { s: 7, e: 23 }, lastT: 'w' };
}

export function normalize(d) {
  if (!d || typeof d !== 'object') return emptyState();

  const plans = {};
  for (const k in (d.plans || {})) {
    const arr = (d.plans[k] || []).map((p) => ({
      id: p.id || genId('p'),
      s: p.s,
      e: p.e,
      t: p.t || 'w',
      items: (p.items || [])
        .map((x) => ({ n: x.n || '', d: x.d ? 1 : 0 }))
        .filter((x) => x.n)
    })).filter((p) => p.items.length);
    if (arr.length) plans[k] = arr;
  }

  const notes = (Array.isArray(d.notes) ? d.notes : [])
    .map((n) => ({
      id: typeof n?.id === 'string' ? n.id : '',
      t: typeof n?.t === 'string' ? n.t : '',
      h: typeof n?.h === 'string' ? n.h : '',
      u: Number(n?.u) || 0
    }))
    .filter((n) => n.id && (n.t || n.h));

  const r = d.range || {};
  const s = Number.isInteger(r.s) ? Math.min(23, Math.max(0, r.s)) : 7;
  const e = Number.isInteger(r.e) ? Math.min(24, Math.max(s + 1, r.e)) : 23;

  return { notes, plans, range: { s, e }, lastT: d.lastT || 'w' };
}

export function hasContent(d) {
  return Boolean(d && ((d.notes?.length || 0) || Object.keys(d.plans || {}).length));
}

export function loadLocal() {
  try {
    return normalize(JSON.parse(localStorage.getItem(KEY)));
  } catch {
    return emptyState();
  }
}

function saveLocal() {
  try {
    localStorage.setItem(KEY, JSON.stringify(S.data));
  } catch { }
}

let baseNotes = new Map();
let basePlans = new Map();
let metaSig = '';

let syncing = false;
let flushAgain = false;
let timer = null;

const noteSig = (n) => JSON.stringify([n.t || '', n.h || '', n.u || 0]);
const planSig = (arr) => JSON.stringify(arr || []);
const metaSignature = () => JSON.stringify([S.data.range, S.data.lastT]);

function resetBase(revs) {
  baseNotes = new Map((S.data.notes || []).map((n) => [
    n.id,
    { sig: noteSig(n), rev: Number(revs?.notes?.[n.id]) || 1 }
  ]));
  basePlans = new Map(Object.entries(S.data.plans || {}).map(([date, arr]) => [
    date,
    { sig: planSig(arr), rev: Number(revs?.plans?.[date]) || 1 }
  ]));
  metaSig = metaSignature();
}

function diffOps() {
  const ops = [];
  const notes = S.data.notes || [];
  const alive = new Set();

  for (const note of notes) {
    alive.add(note.id);
    const rec = baseNotes.get(note.id);
    const sig = noteSig(note);
    if (!rec || rec.sig !== sig) {
      ops.push({ kind: 'note', id: note.id, note, sig, rev: rec ? rec.rev : 0 });
    }
  }
  for (const [id, rec] of baseNotes) {
    if (!alive.has(id)) ops.push({ kind: 'noteDelete', id, rev: rec.rev });
  }

  for (const [date, items] of Object.entries(S.data.plans || {})) {
    const rec = basePlans.get(date);
    const sig = planSig(items);
    if (!rec || rec.sig !== sig) {
      ops.push({ kind: 'plan', date, items, sig, rev: rec ? rec.rev : 0 });
    }
  }
  for (const [date, rec] of basePlans) {
    if (!(date in (S.data.plans || {}))) ops.push({ kind: 'planDelete', date, rev: rec.rev });
  }

  const mSig = metaSignature();
  if (mSig !== metaSig) ops.push({ kind: 'meta', sig: mSig });

  return ops;
}

async function putJSON(url, payload, retried = false) {
  const res = await authedFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (res.status === 409 && !retried) {
    const conflict = await res.json().catch(() => ({}));
    return putJSON(url, { ...payload, rev: Number(conflict.rev) || 0 }, true);
  }
  if (!res.ok) {
    const error = Object.assign(new Error(`sync ${res.status}`), { status: res.status });
    throw error;
  }
  return res.json().catch(() => ({}));
}

async function sendOp(op) {
  switch (op.kind) {
    case 'note': {
      const json = await putJSON(`/api/state/notes/${encodeURIComponent(op.id)}`, {
        t: op.note.t || '',
        h: op.note.h || '',
        u: op.note.u || Date.now(),
        rev: op.rev
      });
      baseNotes.set(op.id, { sig: op.sig, rev: Number(json.rev) || op.rev + 1 });
      return;
    }
    case 'noteDelete': {
      await authedFetch(`/api/state/notes/${encodeURIComponent(op.id)}`, { method: 'DELETE' });
      baseNotes.delete(op.id);
      return;
    }
    case 'plan': {
      const json = await putJSON(`/api/state/plans/${op.date}`, {
        items: op.items,
        u: Date.now(),
        rev: op.rev
      });
      basePlans.set(op.date, { sig: op.sig, rev: Number(json.rev) || op.rev + 1 });
      return;
    }
    case 'planDelete': {
      await authedFetch(`/api/state/plans/${op.date}`, { method: 'DELETE' });
      basePlans.delete(op.date);
      return;
    }
    case 'meta': {
      await putJSON('/api/state/meta', { range: S.data.range, lastT: S.data.lastT });
      metaSig = op.sig;
      return;
    }
  }
}

export function save() {
  saveLocal();
  if (!hasSession()) return;
  clearTimeout(timer);
  timer = setTimeout(flush, SYNC_DEBOUNCE_MS);
}

/**
 * @param {() => void} mutate
 * @param {...(() => void)} renders
 */
export function commit(mutate, ...renders) {
  mutate();
  save();
  for (const render of renders) render();
}

export async function flush() {
  if (!hasSession()) return;
  if (syncing) { flushAgain = true; return; }

  clearTimeout(timer);
  const ops = diffOps();
  if (!ops.length) return;

  syncing = true;
  let failedStatus = 0;
  try {
    for (const op of ops) {
      try {
        await sendOp(op);
      } catch (error) {
        failedStatus = Number(/** @type {any} */ (error)?.status) || 500;
        break;
      }
    }
  } finally {
    syncing = false;
  }

  if (failedStatus && failedStatus !== 401) toast('同步失败，已本地保存');

  if (flushAgain) {
    flushAgain = false;
    clearTimeout(timer);
    timer = setTimeout(flush, SYNC_DEBOUNCE_MS);
  }
}

/** @returns {Promise<{ state: AppState|null, revs?: any }>} */
async function fetchRemote() {
  const res = await authedFetch('/api/state');
  if (res.status === 401) throw { unauth: true };
  if (!res.ok) throw new Error('state fetch failed');
  return res.json();
}

function applyRemote(remote) {
  if (!remote?.state) return;
  S.data = normalize(remote.state);
  saveLocal();
  resetBase(remote.revs);
}

export async function adoptRemote() {
  const remote = await fetchRemote();
  if (remote?.state && (hasContent(remote.state) || !hasContent(S.data))) {
    applyRemote(remote);
  } else if (hasContent(S.data)) {
    await flush();
  }
}

export async function refresh() {
  await flush();
  applyRemote(await fetchRemote());
}
