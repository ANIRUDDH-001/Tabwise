// R0: record installed versions. Read-only: reads files, changes nothing.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const pkg = (name) => {
  try { return JSON.parse(readFileSync(join('node_modules', name, 'package.json'), 'utf8')).version; } catch { return 'NOT INSTALLED'; }
};

const db = new DatabaseSync(':memory:');
const sqlite = db.prepare('SELECT sqlite_version() AS v').get().v;
db.close();

const msPlaywright = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
const browsers = existsSync(msPlaywright) ? readdirSync(msPlaywright).filter((d) => d.startsWith('chromium')).join(', ') : '';

// Same lookup as Guidepup's own getNVDAInstallationPath (lib/windows/NVDA/getNVDAInstallationPath.js):
// <cache>/nvda/all/<manifest version>/extracted/nvda.exe, cache = GUIDEPUP_SCREEN_READERS_PATH or %LOCALAPPDATA%\guidepup.
function nvda() {
  if (process.platform !== 'win32') return 'n/a (not Windows)';
  const manifest = JSON.parse(readFileSync(join('node_modules', '@guidepup', 'guidepup', 'manifest.json'), 'utf8'));
  const asset = manifest.screenReaders.find(({ id }) => id === 'nvda').assets[0];
  const cache = process.env.GUIDEPUP_SCREEN_READERS_PATH
    ? resolve(process.env.GUIDEPUP_SCREEN_READERS_PATH)
    : resolve(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'guidepup');
  const exe = join(cache, 'nvda', 'all', asset.version, 'extracted', 'nvda.exe');
  if (!existsSync(exe)) return `NOT FOUND (expects ${asset.asset}): run npx @guidepup/setup install nvda`;
  const sha = createHash('sha256').update(readFileSync(exe)).digest('hex');
  return `found ${asset.version} at ${exe} (nvda.exe sha256 ${sha.slice(0, 16)}…)`;
}

const rows = [
  ['node', process.versions.node],
  ['sqlite (node:sqlite)', sqlite],
  ['@guidepup/guidepup', pkg('@guidepup/guidepup')],
  ['@guidepup/setup', pkg('@guidepup/setup')],
  ['@playwright/test', pkg('@playwright/test')],
  ['@axe-core/playwright', pkg('@axe-core/playwright')],
  ['axe-core', pkg('axe-core')],
  ['playwright browsers', browsers || 'NOT FOUND: run npx playwright install chromium'],
  ['NVDA', nvda()],
];
for (const [k, v] of rows) console.log(`${k.padEnd(22)} ${v}`);
