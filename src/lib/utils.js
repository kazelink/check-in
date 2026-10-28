// 统一的 JSON 错误响应
export function respondError(c, msg, status) {
  return c.json({ error: msg }, status);
}
