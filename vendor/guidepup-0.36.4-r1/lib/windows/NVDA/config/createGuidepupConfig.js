"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGuidepupConfig = void 0;
const node_fs_1 = require("node:fs");
const errors_1 = require("../../errors");
const node_path_1 = require("node:path");
const resolveGuidepupUserConfigPath_1 = require("./resolveGuidepupUserConfigPath");
const resolveSessionUserConfigPath_1 = require("./resolveSessionUserConfigPath");
const createGuidepupConfig = () => {
    const guidepupUserConfigPath = (0, resolveGuidepupUserConfigPath_1.resolveGuidepupUserConfigPath)();
    if (!(0, node_fs_1.existsSync)(guidepupUserConfigPath)) {
        throw new Error(errors_1.ERR_NVDA_NOT_INSTALLED);
    }
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
    try {
        (0, node_fs_1.mkdirSync)(sessionUserConfigPath, {
            recursive: true,
        });
        const entries = (0, node_fs_1.readdirSync)(guidepupUserConfigPath, {
            encoding: "utf-8",
        });
        for (const entry of entries) {
            (0, node_fs_1.cpSync)((0, node_path_1.join)(guidepupUserConfigPath, entry), (0, node_path_1.join)(sessionUserConfigPath, entry), {
                recursive: true,
            });
        }
    }
    catch (error) {
        try {
            (0, node_fs_1.rmSync)(sessionUserConfigPath, {
                recursive: true,
                force: true,
            });
        }
        catch {
            // Swallow
        }
        throw new Error(errors_1.ERR_NVDA_FAILED_TO_CREATE_GUIDEPUP_PREFERENCES, {
            cause: error,
        });
    }
};
exports.createGuidepupConfig = createGuidepupConfig;
