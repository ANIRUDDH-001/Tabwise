"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteGuidepupConfig = void 0;
const resolveSessionUserConfigPath_1 = require("./resolveSessionUserConfigPath");
const node_fs_1 = require("node:fs");
const deleteGuidepupConfig = () => {
    const sessionUserConfigPath = (0, resolveSessionUserConfigPath_1.resolveSessionUserConfigPath)();
    try {
        (0, node_fs_1.rmSync)(sessionUserConfigPath, {
            recursive: true,
            force: true,
        });
    }
    catch {
        // Swallow
    }
};
exports.deleteGuidepupConfig = deleteGuidepupConfig;
