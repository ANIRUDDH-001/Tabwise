"use strict";
// Added for R1 (D-39); not part of @guidepup/guidepup 0.36.4. See VENDORED.md.
// Holds the one send gate (src/speech/sendguard.mjs sendGate()) that the two key paths ask before every
// send. Set once by scripts/r1.mjs before NVDA.js loads; with no gate set, getGate() throws, so no key is sent.
Object.defineProperty(exports, "__esModule", { value: true });
let gate = null;
function setGate(g) {
    if (gate !== null) {
        throw new Error("R1_GATE_ALREADY_SET");
    }
    for (const name of ["admit", "commit", "launched", "release", "settled", "stop", "isStopped"]) {
        if (typeof g?.[name] !== "function") {
            throw new Error(`R1_GATE_INVALID: ${name}`);
        }
    }
    for (const name of ["writeMs", "sendMs", "killMs"]) {
        if (!(g.bounds?.[name] > 0)) {
            throw new Error(`R1_GATE_INVALID: bounds.${name}`);
        }
    }
    gate = g;
}
function getGate() {
    if (gate === null) {
        throw new Error("R1_NO_GATE");
    }
    return gate;
}
exports.setGate = setGate;
exports.getGate = getGate;
Object.freeze(exports);
