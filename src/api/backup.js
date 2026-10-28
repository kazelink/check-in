import { Hono } from 'hono';
import { authMiddleware } from '../lib/auth.js';
import { respondError } from '../lib/utils.js';
import { metaStatements } from '../lib/meta.js';
import { CONFIG } from '../lib/config.js';
import { isNoteId, isDateKey, isPlainObject, toText, toTimestamp, normalizePlanBlock, normalizeMeta, LIMITS } from '../lib/validate.js';

/** @type {import('hono').Hono<AppBindings>} */
const router = new Hono();

router.use('*', (c, next) => authMiddleware(c, next, { allowCookieOnly: true }));

const SELECT_ALL = [
  'SELECT id, title, html, updated_at, created_at, rev, deleted_at, pos FROM notes ORDER BY pos, created_at',
  'SELECT date, payload FROM plans ORDER BY date',
  'SELECT key, value FROM app_meta'
];

router.get('/', async (c) => {
  const [notesRes, plansRes, metaRes] = await c.env.DB.batch(
    SELECT_ALL.map((sql) => c.env.DB.prepare(sql))
  );

  const keepAfter = Date.now() - CONFIG.PURGE.KEEP_MS;
  const notes = (notesRes.results || [])
    .filter((row) => !row.deleted_at || row.deleted_at >= keepAfter)
    .map((row) => ({
      id: row.id,
      t: row.title,
      h: row.html,
      u: row.updated_at,
      createdAt: row.created_at || null,
      rev: row.rev,
      pos: row.pos || 0,
      deletedAt: row.deleted_at || null
    }));

  const plans = {};
  for (const row of plansRes.results || []) {
    try {
      plans[row.date] = JSON.parse(row.payload);
    } catch {
      plans[row.date] = null;
    }
  }

  const meta = {};
  for (const row of metaRes.results || []) {
    try {
      meta[row.key] = JSON.parse(row.value);
    } catch {
      meta[row.key] = null;
    }
  }

  const body = {
    version: 2,
    exportedAt: new Date().toISOString(),
    notes,
    plans,
    meta: normalizeMeta(meta)
  };

  const stamp = new Date().toISOString().slice(0, 10);
  c.header('Content-Type', 'application/json; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="notes-backup-${stamp}.json"`);
  c.header('Cache-Control', 'no-store');
  return c.body(JSON.stringify(body, null, 2));
});

router.post('/restore', async (c) => {
  const raw = await c.req.text();
  if (raw.length > LIMITS.restoreBytes) return respondError(c, 'Payload Too Large', 413);

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return respondError(c, 'Invalid JSON', 400);
  }
  if (!isPlainObject(body) || body.confirm !== 'replace') {
    return respondError(c, 'Need confirm: replace', 400);
  }

  const notes = Array.isArray(body.notes) ? body.notes : [];
  const plans = isPlainObject(body.plans) ? body.plans : {};
  const meta = normalizeMeta(body.meta || body);

  const statements = [c.env.DB.prepare('DELETE FROM notes'), c.env.DB.prepare('DELETE FROM plans')];

  for (const note of notes) {
    if (!isNoteId(note?.id)) continue;
    statements.push(
      c.env.DB.prepare(`
        INSERT INTO notes (id, title, html, updated_at, created_at, rev, deleted_at, pos)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      `).bind(
        note.id,
        toText(note.t, LIMITS.noteTitle),
        toText(note.h, LIMITS.noteHtml),
        toTimestamp(note.u),
        toTimestamp(note.createdAt || note.u),
        Number(note.deletedAt) || null,
        Number(note.pos) || 0
      )
    );
  }

  for (const [date, items] of Object.entries(plans)) {
    if (!isDateKey(date) || !Array.isArray(items)) continue;
    statements.push(
      c.env.DB.prepare('INSERT INTO plans (date, payload, updated_at, rev) VALUES (?, ?, ?, 1)')
        .bind(date, JSON.stringify(items.map(normalizePlanBlock).filter(Boolean)), Date.now())
    );
  }

  statements.push(...metaStatements(c.env.DB, meta));

  await c.env.DB.batch(statements);
  return c.json({ success: true, notes: notes.length, plans: Object.keys(plans).length });
});

export default router;
