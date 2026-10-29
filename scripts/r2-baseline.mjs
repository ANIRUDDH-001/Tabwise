// R2 axe-core baseline + deterministic page evidence for the R2 fixture pages (PLAN F-03). Not part of npm test.
// Headless Chromium only: keys are Playwright (CDP) input to the page, never OS input. No NVDA, no model, no network.
// This is browser-event evidence, not screen-reader evidence and not proof of keyboard access with assistive technology.
// Usage: node scripts/r2-baseline.mjs --out <file.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { validateFixtures, axeMissed } from '../src/r2/contract.mjs';

const out = process.argv[process.argv.indexOf('--out') + 1];
if (!process.argv.includes('--out') || !out) { console.error('usage: node scripts/r2-baseline.mjs --out <file.json>'); process.exit(2); }
const root = new URL('../fixtures/r2/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root)));
const errors = validateFixtures(manifest, (f) => readFileSync(new URL(f, root)));
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

// Let queued tasks (dialog close event, live-region insertion) run before reading state.
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
const resolveIds = (page, violations) => Promise.all(violations.map(async (v) => ({
  id: v.id, impact: v.impact,
  ids: await page.evaluate((targets) => targets.map((t) => (typeof t === 'string' ? document.querySelector(t)?.id || null : null)), v.nodes.map((n) => n.target.at(-1))),
})));

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const pair of manifest.pairs) {
    for (const kind of ['healthy', 'broken']) {
      const page = await (await browser.newContext()).newPage();
      await page.goto(pathToFileURL(fileURLToPath(new URL(pair[kind].file, root))).href);
      const before = await resolveIds(page, (await new AxeBuilder({ page }).analyze()).violations);
      const steps = [];
      for (const s of pair.task) {
        await page.keyboard.press(s.press);
        await settle(page);
        const active = await page.evaluate(() => (document.activeElement && document.activeElement !== document.body ? document.activeElement.id || document.activeElement.tagName.toLowerCase() : 'body'));
        const want = typeof s.expect_focus === 'object' ? s.expect_focus[kind] : s.expect_focus;
        steps.push({ step: s.step, press: s.press, active, focus_ok: want === undefined ? null : active === want });
      }
      const axe = await new AxeBuilder({ page }).analyze();
      const after = await resolveIds(page, axe.violations);
      const locus = await page.evaluate((id) => { const el = document.getElementById(id); return el && { role: el.getAttribute('role'), text: el.textContent }; }, pair.locus.element);
      const events = await page.evaluate(() => window.__r2Events.map(({ t, ...e }) => e));
      results.push({
        page: `${pair.id}/${kind}`, sha256: pair[kind].sha256, axe_version: axe.testEngine.version,
        violations_before: before, violations_after: after, axe_flags_locus: kind === 'broken' ? !axeMissed(after, pair.locus) : null,
        steps, locus_state: locus, events,
      });
      await page.context().close();
    }
  }
} finally {
  await browser.close();
}
const record = { spec: 'PLAN.md F-03', split: manifest.split, browser: 'chromium headless (Playwright CDP input)', chromium: browser.version?.() ?? null, results };
writeFileSync(out, JSON.stringify(record, null, 2) + '\n');
for (const r of results) {
  console.log(`${r.page.padEnd(22)} axe after-task violations=${r.violations_after.length} flags_locus=${r.axe_flags_locus} focus_ok=${r.steps.map((s) => s.focus_ok).join(',')} locus_role=${r.locus_state?.role} text=${JSON.stringify(r.locus_state?.text)}`);
}
