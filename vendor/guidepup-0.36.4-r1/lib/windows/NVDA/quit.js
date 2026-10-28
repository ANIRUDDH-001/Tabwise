// Modified for R1 (D-43) from @guidepup/guidepup 0.36.4, MIT © 2023 Craig Morten; see VENDORED.md
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quit = quit;
const errors_1 = require("../errors");
const getNVDAInstallationPath_1 = require("./getNVDAInstallationPath");
const child_process_1 = require("child_process");
const isRunning_1 = require("./isRunning");
async function quit({ timeoutMs = 5000, killMs = 1000, resetMs = 2000, probeMs = 500, pollMs = 50, deadlineMs, owned = null } = {}) {
    const executablePath = (0, getNVDAInstallationPath_1.getNVDAInstallationPath)();
    if (!executablePath) {
        throw new Error(errors_1.ERR_NVDA_NOT_INSTALLED);
    }
    const deadline = deadlineMs ?? performance.now() + timeoutMs + killMs + resetMs + probeMs;
    const remaining = () => Math.max(1, deadline - performance.now());
    try {
        if (performance.now() >= deadline) throw new Error("NVDA reset deadline exhausted");
        const running = await (0, isRunning_1.isRunning)({ timeoutMs: Math.min(probeMs, remaining()) });
        if (!running && !owned?.isAlive()) return { listener_stopped: true };
        await new Promise((resolve, reject) => {
            const child = (0, child_process_1.spawn)(executablePath, ["--quit"], { stdio: "ignore", windowsHide: true });
            let finished = false;
            let killTimer;
            const finish = (error) => {
                if (finished) return;
                finished = true;
                clearTimeout(timer); clearTimeout(killTimer);
                if (error) reject(error); else resolve();
            };
            const timer = setTimeout(() => {
                try { child.kill(); } catch { }
                killTimer = setTimeout(() => finish(new Error("NVDA quit process did not terminate")), Math.min(killMs, remaining()));
            }, Math.min(timeoutMs, remaining()));
            child.once("error", (e) => finish(e));
            child.once("close", (code, signal) => finish(code === 0 && !signal ? null : new Error(`NVDA quit exit ${code ?? signal}`)));
        });
        const until = Math.min(deadline, performance.now() + resetMs);
        while (await (0, isRunning_1.isRunning)({ timeoutMs: Math.min(probeMs, remaining()) }) || owned?.isAlive()) {
            if (performance.now() >= until) throw new Error("NVDA listener still running after quit; reset not established");
            await new Promise((r) => setTimeout(r, Math.min(pollMs, remaining())));
        }
        if (performance.now() >= deadline) throw new Error("NVDA reset deadline exhausted");
        return { listener_stopped: true };
    }
    catch (cause) {
        throw new Error(errors_1.ERR_NVDA_QUIT, { cause });
    }
}
