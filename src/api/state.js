import { Hono } from 'hono';
import { CONFIG } from '../lib/config.js';
import { authMiddleware } from '../lib/auth.js';
import { respondError } from '../lib/utils.js';

const router = new Hono();

router.use('*', authMiddleware);

// 读取整份应用状态；从未保存过时返回 { state: null }
router.get('/', async (c) => {
  const row = await c.env.DB
    .prepare('SELECT data, updated_at FROM app_state WHERE id = 1')
    .first();

  if (!row) return c.json({ state: null });

  try {
    return c.json({ state: JSON.parse(row.data), updatedAt: row.updated_at });
  } catch {
    // 数据损坏时不让前端崩溃，视为无数据（前端会用本地缓存覆盖回来）
    return c.json({ state: null });
  }
});

// 覆盖保存整份应用状态（个人应用，last-write-wins 足够）
router.put('/', async (c) => {
  const raw = await c.req.text();

  if (raw.length > CONFIG.STATE_MAX_BYTES) {
    return respondError(c, 'State Too Large', 413);
  }

  let state;
  try {
    state = JSON.parse(raw);
  } catch {
    return respondError(c, 'Invalid JSON', 400);
  }
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return respondError(c, 'Invalid State', 400);
  }

  const updatedAt = new Date().toISOString();
  await c.env.DB
    .prepare(`
      INSERT INTO app_state (id, data, updated_at) VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
    `)
    .bind(raw, updatedAt)
    .run();

  return c.json({ success: true, updatedAt });
});

export default router;
