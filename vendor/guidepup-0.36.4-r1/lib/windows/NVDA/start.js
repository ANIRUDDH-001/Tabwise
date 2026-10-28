// Modified for R1 (D-43) from @guidepup/guidepup 0.36.4, MIT © 2023 Craig Morten; see VENDORED.md
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.start = start;
exports.relayOwnerPid = relayOwnerPid;
const node_child_process_1 = require("node:child_process");
const errors_1 = require("../errors");
const getNVDAInstallationPath_1 = require("./getNVDAInstallationPath");
const config_1 = require("./config");
const isRunning_1 = require("./isRunning");
// Preserve the narrow upstream closure for provenance; R1 uses the bounded readiness loop below.
require("./waitForRunning");
const r1Gate_1 = require("../r1Gate");
async function start({ timeoutMs = 15000, pollMs = 100, probeMs = 500, deadlineMs } = {}) {
    const executablePath = (0, getNVDAInstallationPath_1.getNVDAInstallationPath)();
    if (!executablePath) {
        throw new Error(errors_1.ERR_NVDA_NOT_INSTALLED);
    }
    const sessionUserConfigPath = (0, config_1.resolveSessionUserConfigPath)();
    const until = Math.min(deadlineMs ?? Infinity, performance.now() + timeoutMs);
    if (performance.now() >= until) throw new Error("NVDA startup deadline exhausted");
    if (await (0, isRunning_1.isRunning)({ timeoutMs: Math.min(probeMs, until - performance.now()) })) throw new Error("NVDA listener already running; reset required");
    const gate = (0, r1Gate_1.getGate)();
    if (gate.isStopped()) throw new Error("NVDA startup refused: gate stopped");
    const nvdaProcess = (0, node_child_process_1.spawn)(executablePath, ["--config-path", sessionUserConfigPath], { stdio: "ignore", windowsHide: true });
    let exited = false;
    let failed = null;
    nvdaProcess.on("error", (e) => { failed = e; });
    nvdaProcess.once("exit", () => { exited = true; });
    const isAlive = () => !exited && !failed && nvdaProcess.exitCode === null;
    try {
        if (!Number.isInteger(nvdaProcess.pid) || nvdaProcess.pid <= 0) throw new Error("NVDA process has no PID");
        for (;;) {
            if (!isAlive()) throw failed ?? new Error("NVDA process exited before readiness");
            if (gate.isStopped()) throw new Error("NVDA startup cancelled");
            if (performance.now() >= until) throw new Error("NVDA readiness timed out");
            if (await (0, isRunning_1.isRunning)({ timeoutMs: Math.min(probeMs, until - performance.now()) })) {
                if (!isAlive() || gate.isStopped() || performance.now() >= until) throw new Error("NVDA readiness became invalid");
                return { pid: nvdaProcess.pid, process: nvdaProcess, isAlive };
            }
            if (performance.now() >= until) throw new Error("NVDA readiness timed out");
            await new Promise((r) => setTimeout(r, pollMs));
        }
    } catch (cause) {
        try { nvdaProcess.kill(); } catch { }
        const error = new Error(errors_1.ERR_NVDA_CANNOT_BE_STARTED, { cause });
        error.ownedProcess = { pid: nvdaProcess.pid, process: nvdaProcess, isAlive };
        throw error;
    }
}

// A constant, read-only query; no shell interpolation and no desktop input. Exact PID equality is
// intentionally fail closed. A legitimate launcher handoff must be measured in the isolated preflight.
async function relayOwnerPid({ deadlineMs = performance.now() + 3000 } = {}) {
    const ps = '$ErrorActionPreference="Stop"; $owners=@(Get-NetTCPConnection -State Listen -LocalPort 6837 | Select-Object -ExpandProperty OwningProcess -Unique); if($owners.Count -ne 1){throw "ambiguous relay owner"}; [Console]::Out.WriteLine($owners[0])';
    if (performance.now() >= deadlineMs) throw new Error("NVDA ownership deadline exhausted");
    return new Promise((resolve, reject) => {
        const child = (0, node_child_process_1.spawn)("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(ps, "utf16le").toString("base64")], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
        let output = "";
        let done = false;
        const finish = (error, pid) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            if (error) { try { child.kill(); } catch { } reject(error); } else resolve(pid);
        };
        const timer = setTimeout(() => finish(new Error("NVDA owner query timed out")), Math.max(1, deadlineMs - performance.now()));
        child.stdout.on("data", (data) => { output += String(data); if (output.length > 64) finish(new Error("NVDA owner reply too large")); });
        child.stderr.on("data", () => {});
        child.on("error", (e) => finish(e));
        child.once("close", (code, signal) => {
            const pid = Number(output.trim());
            if (code !== 0 || signal || !/^[1-9][0-9]*$/.test(output.trim()) || !Number.isSafeInteger(pid) || performance.now() >= deadlineMs) finish(new Error("NVDA owner query failed or returned an ambiguous PID"));
            else finish(null, pid);
        });
    });
}
