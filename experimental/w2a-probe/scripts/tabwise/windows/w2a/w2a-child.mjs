// W2a benign page-child stand-in. Started by w2a-host.ps1 (inside the owned job, or outside it for the T5C control).
// It sends no keyboard or mouse input, starts no NVDA and opens only data:, about:blank and chrome://sandbox.
// Each mode prints JSON lines of the form {"w2a":"<event>",...} on stdout; the host reads nothing else.
import {spawn, spawnSync} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const self = fileURLToPath(import.meta.url);
const say = (event, fields = {}) => process.stdout.write(`${JSON.stringify({w2a: event, ...fields})}\n`);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const ms = (value, max) => { const n = Number(value); if (!Number.isSafeInteger(n) || n < 0 || n > max) throw Error(`bad duration ${value}`); return n; };
const hidden = {shell: false, windowsHide: true};
// Same import and arguments as the product (r2-session.mjs:59, :105; network.mjs BROWSER_ARGS).
const product = async () => {
  const [{chromium}, {BROWSER_ARGS}] = await Promise.all([import('@playwright/test'), import('../../network.mjs')]);
  return {chromium, BROWSER_ARGS};
};
// A mode that does not finish in time exits non-zero; the host records it and ends the job.
const guard = setTimeout(() => { say('guard-timeout'); process.exit(3); }, 420_000);
guard.unref();

const [mode, ...args] = process.argv.slice(2);
const modes = {
  async sleep() { await sleep(ms(args[0], 600_000)); },

  async exit() { say('ready', {pid: process.pid}); },

  // T2: a grandchild reports its own job facts (w2a-host.ps1 -Mode SelfReport) and holds briefly so the host can see it.
  async report() {
    const [psExe, hostPs1, source, sha, hold] = args;
    const gc = spawn(psExe, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', hostPs1, '-Mode', 'SelfReport',
      '-Source', source, '-ExpectedSourceSha256', sha, '-HoldMs', '6000'], {...hidden, stdio: ['ignore', 'pipe', 'pipe']});
    let text = '', report = null;
    gc.stdout.on('data', d => {
      text += d;
      for (const line of text.split(/\r?\n/)) if (!report && line.startsWith('{"w2a":"selfreport"')) { report = JSON.parse(line); say('ready', {pid: process.pid, grandchild: {pid: gc.pid, report}}); }
    });
    const code = await new Promise(resolve => gc.on('close', resolve));
    if (!report) say('report-missing', {code, text: text.slice(0, 4000)});
    await sleep(ms(hold, 60_000));
    say('done', {grandchild_exit: code});
  },

  // T4, T6, T7: one detached and one attached sleeping grandchild; this process then exits and leaves both behind.
  async orphan() {
    const hold = String(ms(args[0], 600_000));
    const detached = spawn(process.execPath, [self, 'sleep', hold], {...hidden, detached: true, stdio: 'ignore'});
    const attached = spawn(process.execPath, [self, 'sleep', hold], {...hidden, stdio: 'ignore'});
    detached.unref(); attached.unref();
    say('ready', {pid: process.pid, detached_pid: detached.pid, attached_pid: attached.pid});
    await sleep(500);
  },

  async 'chromium-path'() { const {chromium} = await product(); say('chromium-path', {executable: chromium.executablePath()}); },

  // T5, T5C, T6, T7: headful Chromium exactly as R2 launches it, with Playwright's sandbox switch set explicitly.
  async chromium() {
    const [sandbox, hold] = args;
    if (sandbox !== 'on' && sandbox !== 'off') throw Error('sandbox must be on or off');
    const {chromium, BROWSER_ARGS} = await product();
    const server = await chromium.launchServer({headless: false, chromiumSandbox: sandbox === 'on', args: [...BROWSER_ARGS],
      handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false});
    const browser = await chromium.connect(server.wsEndpoint());
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto('data:text/html,<p id="w">w2a</p>');
      const dataText = await page.textContent('#w');
      let sandboxPage = null;
      if (sandbox === 'on') {
        try { await page.goto('chrome://sandbox', {timeout: 15_000}); await sleep(2000); sandboxPage = (await page.innerText('body')).slice(0, 8000); }
        catch (error) { sandboxPage = `unavailable: ${error.message.slice(0, 300)}`; }
      }
      say('ready', {pid: process.pid, browser_pid: server.process().pid, version: browser.version(), executable: chromium.executablePath(),
        data_text: dataText, sandbox_page: sandboxPage});
      await sleep(ms(hold, 600_000));
      await context.close();
    } finally {
      await browser.close().catch(() => {});
      await server.close();
    }
    say('closed');
  },

  // T10: a Chromium that inherits this process's stdout and outlives it (product arguments plus Playwright's --no-sandbox).
  async 'orphan-chrome'() {
    const {chromium, BROWSER_ARGS} = await product();
    const profile = mkdtempSync(join(tmpdir(), 'w2a-profile-'));
    const chrome = spawn(chromium.executablePath(), [...BROWSER_ARGS, '--no-sandbox', `--user-data-dir=${profile}`, '--no-first-run',
      '--no-default-browser-check', 'about:blank'], {shell: false, detached: true, stdio: ['ignore', 'inherit', 'inherit']});
    chrome.unref();
    say('ready', {pid: process.pid, chrome_pid: chrome.pid});
    await sleep(3000);
  },

  // T9: a WMI query from inside the job; the WMI provider host it wakes runs outside the job.
  async wmi() {
    const ps = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const r = spawnSync(ps, ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance -ClassName Win32_OperatingSystem | Out-Null'],
      {...hidden, stdio: 'ignore', timeout: 60_000});
    say('done', {status: r.status, error: r.error?.message ?? null});
  },
};

if (!Object.hasOwn(modes, mode ?? '')) { say('error', {message: `unknown mode ${mode}`}); process.exit(2); }
try { await modes[mode](); process.exit(0); }
catch (error) { say('error', {message: String(error?.message ?? error).slice(0, 2000)}); process.exit(1); }
