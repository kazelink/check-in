export function respondError(c, msg, status) {
  return c.json({ error: msg }, status);
}
