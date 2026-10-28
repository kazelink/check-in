import { Hono } from 'hono';
import { authMiddleware } from '../lib/auth.js';
import { respondError } from '../lib/utils.js';
import { metaStatements } from '../lib/meta.js';
import {
  isNoteId, isDateKey, isPlainObject, toText, toTimestamp,
  normalizePlanBlock, normalizeMeta, LIMITS
} from '../lib/validate.js';

/** @type {import('hono').Hono<AppBindings>} */
const router = new Hono();

router.use('*', authMiddleware);

const DEFAULT_META = { range: { s: 7, e: 23 }, lastT: 'w' };

async function archiveCorrupt(env, scope, raw) {
  try {
    await env.DB
      .prepare('INSERT INTO corrupt_rows (scope, raw, created_at) VALUES (?, ?, ?)')
      .bind(scope, String(raw).slice(0, 200 * 1024), new Date().toISOString())
      .run();
  } catch (error) {
    console.error('archive corrupt row failed:', scope, error);
  }
}

async function readState(env) {
  const [notesRes, plansRes, metaRes] = await env.DB.batch([
    env.DB.prepare(`
      SELECT id, title, html, updated_at, rev FROM notes
      WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC
    `),
    env.DB.prepare('SELECT date, payload, rev FROM plans ORDER BY date'),
    env.DB.prepare('SELECT key, value FROM app_meta')
  ]);

  const notes = [];
  const noteRevs = {};
  for (const row of notesRes.results || []) {
    notes.push({ id: row.id, t: row.title, h: row.html, u: row.updated_at });
    noteRevs[row.id] = row.rev;
  }

  const plans = {};
  const planRevs = {};
  for (const row of plansRes.results || []) {
    if (!isDateKey(row.date)) {
      await archiveCorrupt(env, `plan-date:${row.date}`, row.payload);
      continue;
    }
    try {
      const items = JSON.parse(row.payload);
      if (!Array.isArray(items)) throw new Error('plan payload is not an array');
      plans[row.date] = items;
      planRevs[row.date] = row.rev;
    } catch {
      await archiveCorrupt(env, `plan:${row.date}`, row.payload);
    }
  }

  const meta = { ...DEFAULT_META };
  for (const row of metaRes.results || []) {
    try {
      meta[row.key] = JSON.parse(row.value);
    } catch {
      await archiveCorrupt(env, `meta:${row.key}`, row.value);
    }
  }

  return {
    state: { notes, plans, range: meta.range, lastT: meta.lastT },
    revs: { notes: noteRevs, plans: planRevs }
  };
}

router.get('/', async (c) => c.json(await readState(c.env)));

router.put('/notes/:id', async (c) => {
  const id = c.req.param('id');
  if (!isNoteId(id)) return respondError(c, 'Invalid Note Id', 400);

  const body = await c.req.json().catch(() => null);
  if (!isPlainObject(body)) return respondError(c, 'Invalid Note', 400);

  const title = toText(body.t, LIMITS.noteTitle).trim();
  const html = toText(body.h, LIMITS.noteHtml);
  const updatedAt = toTimestamp(body.u);

  const current = await c.env.DB
    .prepare('SELECT rev FROM notes WHERE id = ?')
    .bind(id)
    .first();
  const rev = Number(current?.rev) || 0;

  if (body.rev != null && Number(body.rev) !== rev) {
    return c.json({ error: 'Conflict', rev }, 409);
  }

  const nextRev = rev + 1;
  await c.env.DB
    .prepare(`
      INSERT INTO notes (id, title, html, updated_at, created_at, rev, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        html = excluded.html,
        updated_at = excluded.updated_at,
        rev = excluded.rev,
        deleted_at = NULL
    `)
    .bind(id, title, html, updatedAt, updatedAt, nextRev)
    .run();

  return c.json({ rev: nextRev, u: updatedAt });
});

router.delete('/notes/:id', async (c) => {
  const id = c.req.param('id');
  if (!isNoteId(id)) return respondError(c, 'Invalid Note Id', 400);

  await c.env.DB
    .prepare('UPDATE notes SET deleted_at = ?, rev = rev + 1 WHERE id = ? AND deleted_at IS NULL')
    .bind(Date.now(), id)
    .run();

  return c.json({ success: true });
});

router.put('/plans/:date', async (c) => {
  const date = c.req.param('date');
  if (!isDateKey(date)) return respondError(c, 'Invalid Date', 400);

  const body = await c.req.json().catch(() => null);
  if (!isPlainObject(body) || !Array.isArray(body.items)) {
    return respondError(c, 'Invalid Plan', 400);
  }

  const blocks = body.items.map(normalizePlanBlock).filter(Boolean);
  const payload = JSON.stringify(blocks);
  const updatedAt = toTimestamp(body.u);

  const current = await c.env.DB
    .prepare('SELECT rev FROM plans WHERE date = ?')
    .bind(date)
    .first();
  const rev = Number(current?.rev) || 0;

  if (body.rev != null && Number(body.rev) !== rev) {
    return c.json({ error: 'Conflict', rev }, 409);
  }

  const nextRev = rev + 1;
  await c.env.DB
    .prepare(`
      INSERT INTO plans (date, payload, updated_at, rev)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        payload = excluded.payload,
        updated_at = excluded.updated_at,
        rev = excluded.rev
    `)
    .bind(date, payload, updatedAt, nextRev)
    .run();

  return c.json({ rev: nextRev, u: updatedAt });
});

router.delete('/plans/:date', async (c) => {
  const date = c.req.param('date');
  if (!isDateKey(date)) return respondError(c, 'Invalid Date', 400);
  await c.env.DB.prepare('DELETE FROM plans WHERE date = ?').bind(date).run();
  return c.json({ success: true });
});

router.put('/meta', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!isPlainObject(body)) return respondError(c, 'Invalid Meta', 400);

  const meta = normalizeMeta(body);
  await c.env.DB.batch(metaStatements(c.env.DB, meta));

  return c.json({ success: true });
});

export default router;
