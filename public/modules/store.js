import { S } from './ctx.js';
import { authedFetch, hasSession } from './auth.js';
import { genId } from './util.js';
import { toast } from './ui.js';

const KEY = 'checkin-data-v1';
const DIRTY_KEY = 'checkin-dirty-v1';
const SYNC_DEBOUNCE_MS = 800;

/** @typedef {{ id: string, t: string, h: string, u: number }} Note */
/** @typedef {{ id?: string, s: number, e: number, t: string, items: { n: string, d: number }[] }} PlanBlock */
/** @typedef {{ notes: Note[], plans: Record<string, PlanBlock[]>, range: { s: number, e: number }, lastT: string }} AppState */

/** @returns {AppState} */
export function emptyState() {
  return { notes: [], plans: {}, range: { s: 7, e: 23 }, lastT: 'w' };
}

/** @returns {AppState} */
export function normalize(d) {
  if (!d || typeof d !== 'object') return emptyState();

  /** @type {Record<string, PlanBlock[]>} */
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
let failureNotified = false;
let timer = null;

/** @typedef {{ notes: Record<string, 1>, plans: Record<string, 1>, meta: boolean, order: boolean }} Dirty */

/** @returns {Dirty} */
function loadDirty() {
  try {
    const d = JSON.parse(localStorage.getItem(DIRTY_KEY) || 'null');
    if (!d || typeof d !== 'object') return { notes: {}, plans: {}, meta: false, order: false };
    return {
      notes: d.notes && typeof d.notes === 'object' ? d.notes : {},
      plans: d.plans && typeof d.plans === 'object' ? d.plans : {},
      meta: Boolean(d.meta),
      order: Boolean(d.order)
    };
  } catch {
    return { notes: {}, plans: {}, meta: false, order: false };
  }
}

let dirty = loadDirty();
let dirtyCount = Object.keys(dirty.notes).length + Object.keys(dirty.plans).length
  + (dirty.meta ? 1 : 0) + (dirty.order ? 1 : 0);

function saveDirty() {
  try {
    if (dirtyCount) localStorage.setItem(DIRTY_KEY, JSON.stringify(dirty));
    else localStorage.removeItem(DIRTY_KEY);
  } catch { }
}

const noteSig = (n) => JSON.stringify([n.t || '', n.h || '', n.u || 0]);
const planSig = (arr) => JSON.stringify(arr || []);
const metaSignature = () => JSON.stringify([S.data.range, S.data.lastT]);

/** @param {AppState} state */
function resetBase(state, revs) {
  baseNotes = new Map((state.notes || []).map((n) => [
    n.id,
    { sig: noteSig(n), rev: Number(revs?.notes?.[n.id]) || 1 }
  ]));
  basePlans = new Map(Object.entries(state.plans || {}).map(([date, arr]) => [
    date,
    { sig: planSig(arr), rev: Number(revs?.plans?.[date]) || 1 }
  ]));
  metaSig = JSON.stringify([state.range, state.lastT]);
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

  const keptNow = notes.filter((n) => baseNotes.has(n.id)).map((n) => n.id);
  const keptBase = [...baseNotes.keys()].filter((id) => alive.has(id));
  if (keptNow.join('\u0001') !== keptBase.join('\u0001')) {
    ops.push({ kind: 'order', ids: notes.map((n) => n.id) });
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

function refreshDirty() {
  /** @type {Record<string, 1>} */
  const notes = {};
  /** @type {Record<string, 1>} */
  const plans = {};
  let meta = false;
  let order = false;
  for (const op of diffOps()) {
    if (op.kind === 'note' || op.kind === 'noteDelete') notes[op.id] = 1;
    else if (op.kind === 'plan' || op.kind === 'planDelete') plans[op.date] = 1;
    else if (op.kind === 'order') order = true;
    else meta = true;
  }
  dirty = { notes, plans, meta, order };
  dirtyCount = Object.keys(notes).length + Object.keys(plans).length
    + (meta ? 1 : 0) + (order ? 1 : 0);
  saveDirty();
}

const hasDirty = () => dirtyCount > 0;

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
    case 'order': {
      await authedFetch('/api/state/notes-order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: op.ids })
      });
      const ordered = new Map();
      for (const id of op.ids) {
        const rec = baseNotes.get(id);
        if (rec) ordered.set(id, rec);
      }
      for (const [id, rec] of baseNotes) if (!ordered.has(id)) ordered.set(id, rec);
      baseNotes = ordered;
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
  refreshDirty();
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
  if (!navigator.onLine) return;

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

  refreshDirty();

  if (failedStatus && failedStatus !== 401) {
    if (!failureNotified) {
      failureNotified = true;
      toast('同步失败，已本地保存');
    }
  } else {
    failureNotified = false;
  }

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
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const error = Object.assign(new Error(`state ${res.status}`), { status: res.status, detail });
    throw error;
  }
  return res.json();
}

function applyRemote(remote) {
  if (!remote?.state) return;
  S.data = normalize(remote.state);
  saveLocal();
  resetBase(S.data, remote.revs);
  dirty = { notes: {}, plans: {}, meta: false, order: false };
  dirtyCount = 0;
  saveDirty();
}

function mergeRemote(remote) {
  const remoteState = normalize(remote.state);
  const local = S.data;
  const localNotes = new Map(local.notes.map((n) => [n.id, n]));
  const dirtyNotes = dirty.notes || {};

  const notes = [];
  for (const remoteNote of remoteState.notes) {
    if (!(remoteNote.id in dirtyNotes)) { notes.push(remoteNote); continue; }
    const kept = localNotes.get(remoteNote.id);
    if (kept) notes.push(kept);
  }
  const seen = new Set(notes.map((n) => n.id));
  for (const [id, localNote] of localNotes) {
    if (id in dirtyNotes && !seen.has(id)) notes.unshift(localNote);
  }

  if (dirty.order) {
    const localOrder = new Map(local.notes.map((n, i) => [n.id, i]));
    notes.sort((a, b) => (localOrder.get(a.id) ?? 1e9) - (localOrder.get(b.id) ?? 1e9));
  }

  /** @type {Record<string, PlanBlock[]>} */
  const plans = { ...remoteState.plans };
  for (const date of Object.keys(dirty.plans || {})) {
    if (local.plans[date]) plans[date] = local.plans[date];
    else delete plans[date];
  }

  S.data = {
    notes,
    plans,
    range: dirty.meta ? local.range : remoteState.range,
    lastT: dirty.meta ? local.lastT : remoteState.lastT
  };
  saveLocal();
  resetBase(remoteState, remote.revs);
}

export async function adoptRemote() {
  const remote = await fetchRemote();
  if (hasDirty()) {
    if (remote?.state) mergeRemote(remote);
    await flush();
    return;
  }
  if (remote?.state && (hasContent(remote.state) || !hasContent(S.data))) {
    applyRemote(remote);
  } else if (hasContent(S.data)) {
    await flush();
  }
}

export async function refresh() {
  await flush();
  if (hasDirty()) {
    throw Object.assign(new Error('sync pending'), { status: 0, pending: true });
  }
  applyRemote(await fetchRemote());
}
