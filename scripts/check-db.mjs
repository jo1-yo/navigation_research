#!/usr/bin/env node
/**
 * One command that answers "is the experiment actually recording to the server?"
 *
 * Run it before every data-collection session:  npm run check:db
 *
 * It reads .env the same way the app does, resolves the host, and reads a row
 * count out of each table the experiment writes to. A paused Supabase project
 * (free projects pause after a week idle) stops resolving entirely, which is
 * exactly what a silently-broken run looks like — so that case is named
 * explicitly rather than reported as a generic network error.
 */
import { readFileSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TABLES = ['participants', 'sessions', 'orientation_blocks', 'trials'];

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

function readEnv() {
  let raw;
  try {
    raw = readFileSync(join(root, '.env'), 'utf8');
  } catch {
    return {};
  }
  const out = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function fail(msg, hint) {
  console.log(`${red('✗')} ${msg}`);
  if (hint) console.log(`  ${dim(hint)}`);
  process.exit(1);
}

const env = readEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

console.log('Checking the database the app writes to\n');

if (!url || !key) {
  fail('.env has no VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY',
       'Copy .env.example to .env and fill in the project URL and anon key.');
}

const host = new URL(url).host;
console.log(`  project   ${host}`);
console.log(`  key       ${key.slice(0, 12)}…${dim(`(${key.length} chars)`)}\n`);

try {
  const { address } = await lookup(host);
  console.log(`${green('✓')} host resolves (${address})`);
} catch (err) {
  if (err.code === 'ENOTFOUND') {
    fail(`host does not resolve: ${host}`,
         'A Supabase subdomain only exists while the project is running. Free projects\n' +
         '  are PAUSED after ~7 days idle and stop resolving — open supabase.com/dashboard\n' +
         '  and hit Restore (your data is still there). If the project was deleted instead,\n' +
         '  create a new one, run supabase/schema.sql in its SQL editor, and update .env.');
  }
  fail(`DNS lookup failed for ${host}: ${err.code || err.message}`);
}

const headers = { apikey: key, Authorization: `Bearer ${key}` };
let bad = 0;

for (const table of TABLES) {
  let res;
  try {
    res = await fetch(`${url}/rest/v1/${table}?select=id`, {
      headers: { ...headers, Prefer: 'count=exact', Range: '0-0' },
    });
  } catch (err) {
    console.log(`${red('✗')} ${table.padEnd(19)} unreachable (${err.cause?.code || err.message})`);
    bad++;
    continue;
  }

  if (res.status === 401 || res.status === 403) {
    console.log(`${red('✗')} ${table.padEnd(19)} ${res.status} — the key is rejected`);
    bad++;
    continue;
  }
  if (res.status === 404) {
    console.log(`${red('✗')} ${table.padEnd(19)} table does not exist`);
    bad++;
    continue;
  }
  if (!res.ok) {
    console.log(`${red('✗')} ${table.padEnd(19)} HTTP ${res.status} ${dim((await res.text()).slice(0, 90))}`);
    bad++;
    continue;
  }

  const count = res.headers.get('content-range')?.split('/')[1] ?? '?';
  console.log(`${green('✓')} ${table.padEnd(19)} ${String(count).padStart(6)} rows`);
}

console.log();
if (bad) {
  console.log(red(`${bad} of ${TABLES.length} tables are not usable.`));
  console.log(dim('If the tables are missing, run supabase/schema.sql in the project SQL editor.'));
  process.exit(1);
}
console.log(green('Recording to the server is working.'));
