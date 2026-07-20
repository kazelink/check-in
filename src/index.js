import { Hono } from 'hono';
import { ensureSchema } from './lib/schema.js';
import { escapeHtml, respondError } from './lib/utils.js';

import loginRouter from './api/login.js';
import stateRouter from './api/state.js';

const app = new Hono();

app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/state' || c.req.path.startsWith('/api/state/')) {
    await ensureSchema(c.env);
  }
  await next();
  // API responses are dynamic and authenticated — never cacheable.
  if (!c.res.headers.has('Cache-Control')) {
    c.res.headers.set('Cache-Control', 'no-store');
  }
});

app.onError((error, c) => {
  console.error(`Unhandled error on ${c.req.method} ${c.req.path}:`, error);
  const message = escapeHtml(error?.message || 'Internal Server Error');

  if (c.req.path.startsWith('/api/')) {
    return respondError(c, message, 500);
  }
  return c.text('Internal Server Error', 500);
});

app.get('/', (c) => c.redirect('/app.html'));
app.get('/index.html', (c) => c.redirect('/app.html'));

app.route('/api/login', loginRouter);
app.route('/api/state', stateRouter);

app.all('*', (c) => c.json({ error: 'Not Found' }, 404));

export default {
  fetch: app.fetch
};
