"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isNVDAInstalled = isNVDAInstalled;
const getNVDAInstallationPath_1 = require("./getNVDAInstallationPath");
function isNVDAInstalled() {
    try {
        const path = (0, getNVDAInstallationPath_1.getNVDAInstallationPath)();
        return !!path;
    }
    catch {
        return false;
    }
}
