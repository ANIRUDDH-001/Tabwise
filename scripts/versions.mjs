// R0: record installed versions. Read-only: queries files and the registry, changes nothing.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const pkg = (name) => {
  try { return JSON.parse(readFileSync(join('node_modules', name, 'package.json'), 'utf8')).version; } catch { return 'NOT INSTALLED'; }
};

const db = new DatabaseSync(':memory:');
const sqlite = db.prepare('SELECT sqlite_version() AS v').get().v;
db.close();

const msPlaywright = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
const browsers = existsSync(msPlaywright) ? readdirSync(msPlaywright).filter((d) => d.startsWith('chromium')).join(', ') : '';

// Guidepup's setup records NVDA under this key (node_modules/@guidepup/guidepup/lib/windows/NVDA/constants.js).
function nvda() {
  if (process.platform !== 'win32') return 'n/a (not Windows)';
  try {
    const out = execFileSync('reg', ['query', 'HKCU\\Software\\Guidepup\\Nvda'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const values = out.split('\n').filter((l) => l.includes('REG_SZ')).map((l) => l.trim().split(/\s{2,}/).pop());
    return values.length ? `found (Guidepup): ${values.join('; ')}` : 'Guidepup key present, no path';
  } catch {
    const system = ['C:\\Program Files (x86)\\NVDA\\nvda.exe', 'C:\\Program Files\\NVDA\\nvda.exe'].find(existsSync);
    return system ? `NOT SET UP for Guidepup; system NVDA at ${system}` : 'NOT FOUND: run npx @guidepup/setup';
  }
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
