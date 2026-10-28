// Modified for R1 (D-39) from @guidepup/guidepup 0.36.4, MIT © 2023 Craig Morten; see VENDORED.md
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendKeys = sendKeys;
const errors_1 = require("./errors");
const isKeyCode_1 = require("../isKeyCode");
const runVbsScript_1 = require("./runVbsScript");
// R1: only one plain character per call (NVDA.type); key codes and modifiers go through NVDA instead.
async function sendKeys(command) {
    try {
        if ((0, isKeyCode_1.isKeyCode)(command) ||
            (command?.modifiers ?? []).length !== 0 ||
            typeof command?.characters !== "string" ||
            command.characters.length !== 1) {
            throw new Error("R1_SENDKEYS_REFUSED");
        }
        await (0, runVbsScript_1.runSendKeys)(command.characters);
    }
    catch (cause) {
        throw new Error(errors_1.ERR_SEND_KEYS, { cause });
    }
}
Object.freeze(exports);
