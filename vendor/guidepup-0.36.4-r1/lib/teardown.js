// Modified for R1 (D-39) from @guidepup/guidepup 0.36.4, MIT © 2023 Craig Morten; see VENDORED.md
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addTeardownHandler = addTeardownHandler;
exports.removeTeardownHandler = removeTeardownHandler;
// R1: handlers are only recorded. scripts/r1.mjs installTeardown owns every process signal and crash
// handler (B02), so no process listener is added here.
const teardownHandlers = new Set();
function addTeardownHandler(handler) {
    teardownHandlers.add(handler);
}
function removeTeardownHandler(handler) {
    teardownHandlers.delete(handler);
}
Object.freeze(exports);
