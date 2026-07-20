// Escape HTML special characters to prevent XSS in template interpolation
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#x60;' };
const ESC_RE = /[&<>"'`]/g;
export const escapeHtml = (str) => str == null ? '' : String(str).replace(ESC_RE, c => ESC_MAP[c] || c);

export function respondError(c, msg, status) {
  return c.json({ error: msg }, status);
}
