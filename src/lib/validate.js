
export const LIMITS = {
  noteTitle: 200,
  noteHtml: 200 * 1024,
  planItems: 200,
  planItemText: 200,
  restoreBytes: 8 * 1024 * 1024
};

const NOTE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const isNoteId = (v) => typeof v === 'string' && NOTE_ID_RE.test(v);
export const isDateKey = (v) => typeof v === 'string' && DATE_RE.test(v);
export const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

export function toText(value, max) {
  if (typeof value !== 'string') return '';
  return value.length > max ? value.slice(0, max) : value;
}

export function toTimestamp(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return Date.now();
  if (n < 978307200000 || n > 4102444800000) return Date.now();
  return Math.trunc(n);
}

export function normalizePlanItems(items) {
  if (!Array.isArray(items)) return null;
  const out = [];
  for (const item of items.slice(0, LIMITS.planItems)) {
    if (!item || typeof item !== 'object') continue;
    const n = toText(item.n, LIMITS.planItemText).trim();
    if (!n) continue;
    out.push({ n, d: item.d ? 1 : 0 });
  }
  return out;
}

export function normalizePlanBlock(block) {
  if (!isPlainObject(block)) return null;
  const s = Number(block.s);
  const e = Number(block.e);
  if (!Number.isInteger(s) || !Number.isInteger(e)) return null;
  if (s < 0 || e > 24 * 60 || e <= s) return null;
  const type = typeof block.t === 'string' && block.t.length <= 2 ? block.t : 'w';
  const items = normalizePlanItems(block.items);
  if (!items || !items.length) return null;
  return { id: toText(block.id, 40) || undefined, s, e, t: type, items };
}

export function normalizeMeta(body) {
  const range = body?.range;
  const s = Number(range?.s);
  const e = Number(range?.e);
  const safeS = Number.isInteger(s) ? Math.min(23, Math.max(0, s)) : 7;
  const safeE = Number.isInteger(e) ? Math.min(24, Math.max(safeS + 1, e)) : 23;
  const lastT = typeof body?.lastT === 'string' && body.lastT.length <= 2 ? body.lastT : 'w';
  return { range: { s: safeS, e: safeE }, lastT };
}
