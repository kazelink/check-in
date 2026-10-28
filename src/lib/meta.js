// 元信息（时间范围 / 上次使用的日程类型）的写入语句，供状态接口与恢复接口共用

const UPSERT = `
  INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
`;

/**
 * @param {any} db D1 绑定
 * @param {{ range: { s: number, e: number }, lastT: string }} meta
 * @param {number} [now]
 */
export function metaStatements(db, meta, now = Date.now()) {
  return [
    db.prepare(UPSERT).bind('range', JSON.stringify(meta.range), now),
    db.prepare(UPSERT).bind('lastT', JSON.stringify(meta.lastT), now)
  ];
}
