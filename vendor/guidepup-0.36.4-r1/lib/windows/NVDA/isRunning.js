// Modified for R1 (D-43) from @guidepup/guidepup 0.36.4, MIT © 2023 Craig Morten; see VENDORED.md
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRunning = isRunning;
const constants_1 = require("./constants");
const net_1 = require("net");
async function isRunning({ timeoutMs = 500 } = {}) {
    return new Promise((resolve, reject) => {
        let client;
        let timer;
        let finished = false;
        const done = (err, running) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            try { client?.destroy(); } catch { }
            if (err) reject(err); else resolve(running);
        };
        try { client = (0, net_1.connect)(constants_1.NVDA_PORT, constants_1.NVDA_HOST); }
        catch (e) { done(e); return; }
        timer = setTimeout(() => done(new Error("NVDA listener probe timed out")), timeoutMs);
        client.once("connect", () => done(null, true));
        // Only a positive refusal establishes absence. Unknown probe errors never prove reset.
        client.on("error", (e) => e.code === "ECONNREFUSED" ? done(null, false) : done(e));
    });
}
