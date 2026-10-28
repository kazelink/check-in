import { Hono } from 'hono';
import { authMiddleware } from '../lib/auth.js';
import { respondError } from '../lib/utils.js';
import { metaStatements } from '../lib/meta.js';
import { CONFIG } from '../lib/config.js';
import {
  isNoteId, isDateKey, isPlainObject, toText, toTimestamp,
  normalizePlanBlock, normalizeMeta, LIMITS
} from '../lib/validate.js';

/** @type {import('hono').Hono<AppBindings>} */
const router = new Hono();

router.use('*', authMiddleware);

const DEFAULT_META = { range: { s: 7, e: 23 }, lastT: 'w' };

async function purgeExpiredNotes(env, lastPurgeAt) {
  const now = Date.now();
  if (now - (Number(lastPurgeAt) || 0) < CONFIG.PURGE.INTERVAL_MS) return;

  try {
    await env.DB.batch([
      env.DB
        .prepare('DELETE FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < ?')
        .bind(now - CONFIG.PURGE.KEEP_MS),
      env.DB
        .prepare(`
          INSERT INTO app_meta (key, value, updated_at) VALUES ('purgedAt', ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `)
        .bind(JSON.stringify(now), now)
    ]);
  } catch (error) {
    console.error('purge deleted notes failed:', error);
  }
}

async function archiveCorrupt(env, scope, raw) {
  try {
    await env.DB
      .prepare(`
        INSERT INTO corrupt_rows (scope, raw, created_at)
        SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM corrupt_rows WHERE scope = ?)
      `)
      .bind(scope, String(raw).slice(0, 200 * 1024), new Date().toISOString(), scope)
      .run();
  } catch (error) {
    console.error('archive corrupt row failed:', scope, error);
  }
}

async function readState(env) {
  const [notesRes, plansRes, metaRes] = await env.DB.batch([
    env.DB.prepare(`
      SELECT id, title, html, updated_at, rev FROM notes
      WHERE deleted_at IS NULL ORDER BY pos ASC, created_at DESC, id DESC
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

  /** @type {Record<string, any>} */
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
    revs: { notes: noteRevs, plans: planRevs },
    purgedAt: Number(meta.purgedAt) || 0
  };
}

router.get('/', async (c) => {
  const { purgedAt, ...payload } = await readState(c.env);
  c.executionCtx.waitUntil(purgeExpiredNotes(c.env, purgedAt));
  return c.json(payload);
});

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
      INSERT INTO notes (id, title, html, updated_at, created_at, rev, deleted_at, pos)
      VALUES (?, ?, ?, ?, ?, ?, NULL, (SELECT COALESCE(MIN(pos), 0) - 1 FROM notes))
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

router.put('/notes-order', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!isPlainObject(body) || !Array.isArray(body.ids)) {
    return respondError(c, 'Invalid Order', 400);
  }

  const ids = [...new Set(body.ids.filter(isNoteId))].slice(0, 500);
  if (!ids.length) return c.json({ success: true, count: 0 });

  await c.env.DB.batch(
    ids.map((id, index) => c.env.DB.prepare('UPDATE notes SET pos = ? WHERE id = ?').bind(index, id))
  );

  return c.json({ success: true, count: ids.length });
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
