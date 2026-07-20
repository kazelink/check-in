import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const CONFIG = 'wrangler.toml';
const TEMP_CONFIG = '.tmp-wrangler-build.toml';
const SECRET_NAMES = ['APP_PASSWORD', 'JWT_SECRET'];
const SECRET_RETRY_MAX = 5;
const D1_BINDING = 'DB';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runWrangler(args, { input, inherit = false } = {}) {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(command, ['wrangler', ...args], {
    encoding: 'utf8',
    input,
    stdio: inherit ? ['pipe', 'inherit', 'inherit'] : ['pipe', 'pipe', 'pipe']
  });

  return {
    ok: result.status === 0,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim()
  };
}

function runOrThrow(args, options) {
  const result = runWrangler(args, options);
  if (!result.ok) {
    throw new Error(result.stderr || result.stdout || `Wrangler command failed: ${args.join(' ')}`);
  }
  return result.stdout;
}

function getWranglerJson(args) {
  const result = runWrangler([...args, '--json']);
  if (!result.ok || !result.stdout) return null;

  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function isRetryableSecretError(msg) {
  const text = String(msg || '').toLowerCase();
  return (
    text.includes('502') ||
    text.includes('503') ||
    text.includes('504') ||
    text.includes('bad gateway') ||
    text.includes('malformed response') ||
    text.includes('timed out') ||
    text.includes('econnreset') ||
    text.includes('etimedout') ||
    text.includes('fetch failed')
  );
}

function isScriptMissingError(msg) {
  const text = String(msg || '').toLowerCase();
  return (
    text.includes('404') ||
    text.includes('not found') ||
    text.includes('workers.scripts.api.error.script_not_found')
  );
}

function getSecretSetupHint() {
  return [
    'Set the Cloudflare deploy command to `npm run deploy`.',
    `Add these build secrets in the Cloudflare deploy page: ${SECRET_NAMES.join(', ')}.`
  ].join(' ');
}

function getBuildSecrets() {
  const entries = SECRET_NAMES.map((name) => [name, process.env[name] || '']);
  const present = entries.filter(([, value]) => value);

  if (present.length === 0) {
    throw new Error(`Missing required build secrets. ${getSecretSetupHint()}`);
  }
  if (present.length !== SECRET_NAMES.length) {
    const missing = entries.filter(([, value]) => !value).map(([name]) => name);
    throw new Error(`Build secrets are incomplete. Missing: ${missing.join(', ')}. ${getSecretSetupHint()}`);
  }

  return Object.fromEntries(entries);
}

function readBaseConfig() {
  return fs.readFileSync(path.join(process.cwd(), CONFIG), 'utf8');
}

function extractWorkerName(rawConfig) {
  const match = rawConfig.match(/^\s*name\s*=\s*"([^"]+)"/m);
  if (!match) {
    throw new Error(`Unable to read Worker name from ${CONFIG}`);
  }
  return match[1];
}

function getDbName(rawConfig, workerName) {
  const match = rawConfig.match(/^\s*database_name\s*=\s*"([^"]+)"/m);
  return match ? match[1] : `${workerName}-db`;
}

function findD1(dbName) {
  const list = getWranglerJson(['d1', 'list']);
  return list?.find((item) => item.name === dbName) || null;
}

// Reuse the existing D1 database by name, creating it on first deploy, so the
// database_id never has to be committed to the repo.
function ensureD1(dbName) {
  let db = findD1(dbName);
  if (!db) {
    console.log(`D1 database '${dbName}' not found. Creating...`);
    runOrThrow(['d1', 'create', dbName], { inherit: true });
    db = findD1(dbName);
  }
  if (!db?.uuid) {
    throw new Error(`Unable to resolve D1 database '${dbName}'. Create it manually with: npx wrangler d1 create ${dbName}`);
  }
  return { databaseName: db.name, databaseId: db.uuid };
}

function injectBindingFields(rawConfig, blockName, bindingName, extraLines) {
  if (!extraLines.length) return rawConfig;

  const blockPattern = new RegExp(
    `(\\[\\[${blockName}\\]\\]\\s*\\r?\\n(?:[^\\[]*?\\r?\\n)*?binding\\s*=\\s*"${bindingName}"\\s*\\r?\\n)`,
    'm'
  );

  const match = rawConfig.match(blockPattern);
  if (!match) return rawConfig;

  const existingBlock = match[0];
  const missingLines = extraLines.filter((line) => {
    const key = line.split('=')[0].trim();
    return !new RegExp(`^\\s*${key}\\s*=`, 'm').test(existingBlock);
  });

  if (!missingLines.length) return rawConfig;

  return rawConfig.replace(blockPattern, `${match[1]}${missingLines.join('\n')}\n`);
}

function createResolvedConfig(rawConfig, d1) {
  const next = injectBindingFields(rawConfig, 'd1_databases', D1_BINDING, [
    `database_name = "${d1.databaseName}"`,
    `database_id = "${d1.databaseId}"`
  ]);

  const tempPath = path.join(process.cwd(), TEMP_CONFIG);
  fs.writeFileSync(tempPath, next);
  return tempPath;
}

async function syncRuntimeSecret(name, value, configPath) {
  for (let attempt = 1; attempt <= SECRET_RETRY_MAX; attempt += 1) {
    const result = runWrangler(['secret', 'put', name, '--config', configPath], { input: value });
    if (result.ok) {
      console.log(`Runtime secret '${name}' synced.`);
      return;
    }

    const errText = result.stderr || result.stdout || '';
    if (attempt < SECRET_RETRY_MAX && (isRetryableSecretError(errText) || isScriptMissingError(errText))) {
      const waitMs = Math.min(1000 * (2 ** (attempt - 1)), 8000);
      console.log(`Secret '${name}' not ready yet (attempt ${attempt}/${SECRET_RETRY_MAX}), retrying in ${waitMs}ms...`);
      await sleep(waitMs);
      continue;
    }

    throw new Error(`Failed to sync runtime secret '${name}': ${errText || 'unknown error'}`);
  }
}

async function main() {
  const buildSecrets = getBuildSecrets();
  const rawConfig = readBaseConfig();
  const workerName = extractWorkerName(rawConfig);
  const dbName = getDbName(rawConfig, workerName);

  const d1 = ensureD1(dbName);
  console.log(`Using D1 database '${d1.databaseName}' (ID stays out of the repo).`);

  const configPath = createResolvedConfig(rawConfig, d1);

  try {
    runOrThrow(['deploy', '--config', configPath], { inherit: true });

    for (const name of SECRET_NAMES) {
      await syncRuntimeSecret(name, buildSecrets[name], configPath);
    }

    console.log('Deploy complete. Worker runtime secrets are in sync.');
  } finally {
    fs.rmSync(path.join(process.cwd(), TEMP_CONFIG), { force: true });
  }
}

main().catch((error) => {
  console.error(`Deploy failed: ${error.message || error}`);
  process.exit(1);
});
