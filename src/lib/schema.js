// 整个应用的状态存为一行 JSON（个人应用，数据量小，单行读写最简单可靠）。
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS app_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`.trim();

let schemaReadyPromise = null;

export function ensureSchema(env) {
  if (!env?.DB) return;
  if (schemaReadyPromise) return schemaReadyPromise;

  schemaReadyPromise = env.DB.prepare(SCHEMA_SQL).run().catch((error) => {
    schemaReadyPromise = null;
    throw error;
  });

  return schemaReadyPromise;
}
