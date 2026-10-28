import { Hono } from 'hono';
import { ensureSchema } from './lib/schema.js';
import { respondError } from './lib/utils.js';

import loginRouter from './api/login.js';
import stateRouter from './api/state.js';
import backupRouter from './api/backup.js';

/** @type {import('hono').Hono<AppBindings>} */
const app = new Hono();

app.use('/api/*', async (c, next) => {
  if (c.req.path.startsWith('/api/state') || c.req.path.startsWith('/api/backup')) {
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

app.route('/api/login', loginRouter);
app.route('/api/state', stateRouter);
app.route('/api/backup', backupRouter);

app.all('*', (c) => c.json({ error: 'Not Found' }, 404));

export default {
  fetch: app.fetch
};
