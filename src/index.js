import { Hono } from 'hono';
import { ensureSchema } from './lib/schema.js';
import { authMiddleware } from './lib/auth.js';
import { respondError } from './lib/utils.js';

import loginRouter from './api/login.js';
import stateRouter from './api/state.js';
import backupRouter from './api/backup.js';

/** @type {import('hono').Hono<AppBindings>} */
const app = new Hono();

app.use('/api/*', async (c, next) => {
  if (c.req.path.startsWith('/api/state') || c.req.path.startsWith('/api/backup')) {
    if (!c.env.DB) {
      console.error('D1 binding "DB" is missing: check the database_id injected at deploy time');
      return respondError(c, 'D1 binding missing', 503);
    }
    await ensureSchema(c.env);
  }
  await next();
  if (!c.res.headers.has('Cache-Control')) {
    c.res.headers.set('Cache-Control', 'no-store');
  }
});

app.onError((error, c) => {
  console.error(`Unhandled error on ${c.req.method} ${c.req.path}:`, error);
  const message = error?.message || 'Internal Server Error';

  if (c.req.path.startsWith('/api/')) {
    return respondError(c, message, 500);
  }
  return c.text('Internal Server Error', 500);
});

app.get('/', (c) => c.redirect('/app.html'));
app.get('/index.html', (c) => c.redirect('/app.html'));

app.use('/api/health', (c, next) => authMiddleware(c, next, { allowCookieOnly: true }));

app.get('/api/health', async (c) => {
  if (!c.env.DB) return c.json({ ok: false, db: false, error: 'D1 binding missing' }, 503);
  try {
    await ensureSchema(c.env);
    const result = await c.env.DB
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('notes', 'plans', 'app_meta', 'corrupt_rows')")
      .all();
    const tables = (result.results || []).map((row) => row.name).sort();
    return c.json({ ok: tables.length === 4, db: true, tables });
  } catch (error) {
    return c.json({ ok: false, db: true, error: String(error?.message || error) }, 500);
  }
});

app.route('/api/login', loginRouter);
app.route('/api/state', stateRouter);
app.route('/api/backup', backupRouter);

app.all('*', (c) => c.json({ error: 'Not Found' }, 404));

export default {
  fetch: app.fetch
};
