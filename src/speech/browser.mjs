// The runner supplies Playwright only after its CI, checkout and integrity gates pass.
// No Playwright import here: offline tests exercise the same adapter with a fake engine.
export function fixtureBrowser({ chromium, cfg, versions }) {
  return {
    async open(url) {
      const server = await chromium.launchServer({ headless: false, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false });
      const pid = server.process()?.pid;
      try {
        const b = await chromium.connect(server.wsEndpoint());
        versions.chromium ??= b.version();
        const page = await b.newPage();
        await page.addInitScript(() => {
          const log = [];
          let seq = 0;
          Object.defineProperty(window, '__r1Keys', { value: log, writable: false, configurable: false });
          window.addEventListener('keydown', (e) => { log.push({ seq: ++seq, key: e.key, shift: e.shiftKey }); }, true);
        });
        await page.goto(url, { waitUntil: 'load', timeout: cfg.load_timeout_ms });
        return {
          pid,
          keys: (from) => page.evaluate((f) => (window.__r1Keys || []).filter((e) => e.seq > f), from),
          close: async () => { await b.close().catch(() => {}); await server.close(); },
          kill: async () => { await server.kill(); },
        };
      } catch (e) {
        await server.kill().catch(() => {});
        throw e;
      }
    },
  };
}
