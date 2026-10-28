
const UPSERT = `
  INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
`;

/**
 * @param {any} db
 * @param {{ range: { s: number, e: number }, lastT: string }} meta
 * @param {number} [now]
 */
export function metaStatements(db, meta, now = Date.now()) {
  return [
    db.prepare(UPSERT).bind('range', JSON.stringify(meta.range), now),
    db.prepare(UPSERT).bind('lastT', JSON.stringify(meta.lastT), now)
  ];
}
