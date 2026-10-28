// Modified for R1 (D-39) from @guidepup/guidepup 0.36.4, MIT © 2023 Craig Morten; see VENDORED.md
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runVbsScript = runVbsScript;
exports.runSendKeys = runSendKeys;
const path_1 = require("path");
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const os_1 = require("os");
const r1Gate_1 = require("./r1Gate");
const { mkdtemp, realpath, rm, writeFile } = fs_1.promises;
// R1: captured once at load; called only in runSendKeys.
const execFile = child_process_1.execFile;
const DEFAULT_MAX_BUFFER = 1000 * 1000 * 100;
const CSCRIPT = "cscript";
// R1: the only characters the fixture types (steps.json); none is special to SendKeys or to VBScript.
const SENDKEYS_CHAR = /^[A-Za-z0-9@.]$/;
// R1: arbitrary scripts are disabled; runSendKeys is the only cscript path.
async function runVbsScript() {
    throw new Error("R1_VBS_DISABLED");
}
// R1: one SendKeys character per cscript, through the gate. The script is written first, so the
// foreground check sits right before the launch: admit (bounded check), then in the same turn commit and
// execFile. The child must exit within sendMs; otherwise it is killed and waited for killMs more. A child
// that still has not exited is released as not ended and settles when it does. A gate stop kills the
// child (best effort: a key cscript has already sent cannot be recalled).
async function runSendKeys(character) {
    if (typeof character !== "string" || !SENDKEYS_CHAR.test(character)) {
        throw new Error(`R1_CHAR_REFUSED: ${JSON.stringify(character)}`);
    }
    const gate = r1Gate_1.getGate();
    const dir = await mkdtemp((await realpath((0, os_1.tmpdir)())) + path_1.sep);
    try {
        const filePath = (0, path_1.join)(dir, "script.vbs");
        await writeFile(filePath, `set WshShell = CreateObject("WScript.Shell")\nWshShell.SendKeys "${character}"`);
        const token = await gate.admit({ path: "sendkeys", char: character });
        if (!gate.commit(token)) {
            throw new Error("R1_REFUSED: commit");
        }
        let error = null;
        let ended = true;
        let exit = null;
        let lingering = false;
        let onExit = () => null;
        const exited = new Promise((resolve) => {
            onExit = resolve;
        });
        let child = null;
        try {
            child = execFile(CSCRIPT, [filePath], { windowsHide: true, maxBuffer: DEFAULT_MAX_BUFFER }, () => null);
        }
        catch (e) {
            error = e?.message ?? String(e);
        }
        if (child) {
            child.on("exit", (code, signal) => {
                exit = { code, signal };
                onExit();
                if (lingering) {
                    gate.settled(token);
                }
            });
            gate.launched(token, () => child.kill());
            child.stdin?.end();
            const wait = async (ms) => {
                let timer;
                await Promise.race([exited, new Promise((resolve) => { timer = setTimeout(resolve, ms); })]);
                clearTimeout(timer);
            };
            await wait(gate.bounds.sendMs);
            if (exit === null) {
                try {
                    child.kill();
                }
                catch {
                    // best effort
                }
                await wait(gate.bounds.killMs);
            }
            if (exit === null) {
                error = "cscript did not exit";
                ended = false;
                lingering = true;
            }
            else if (exit.code !== 0) {
                error = `cscript exit ${exit.code ?? exit.signal}`;
            }
        }
        await gate.release(token, { error, ended });
        if (error) {
            throw new Error(`R1_SEND_FAILED: ${error}`);
        }
    }
    finally {
        // R1: best effort; a child that is still running may hold the script open.
        await rm(dir, { recursive: true, force: true }).catch(() => null);
    }
}
Object.freeze(exports);
