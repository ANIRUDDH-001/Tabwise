"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfig = getConfig;
const node_fs_1 = require("node:fs");
const errors_1 = require("../../errors");
const node_path_1 = require("node:path");
const parseIni_1 = require("./parseIni");
const resolveGuidepupUserConfigPath_1 = require("./resolveGuidepupUserConfigPath");
const resolveSessionUserConfigPath_1 = require("./resolveSessionUserConfigPath");
function getConfig() {
    const sessionUserConfigPath = (0, node_path_1.join)((0, resolveSessionUserConfigPath_1.resolveSessionUserConfigPath)(), "nvda.ini");
    const configPath = (0, node_fs_1.existsSync)(sessionUserConfigPath)
        ? sessionUserConfigPath
        : (0, node_path_1.join)((0, resolveGuidepupUserConfigPath_1.resolveGuidepupUserConfigPath)(), "nvda.ini");
    try {
        const contents = (0, node_fs_1.readFileSync)(configPath, "utf8");
        return (0, parseIni_1.parseIni)(contents);
    }
    catch (cause) {
        throw new Error(errors_1.ERR_NVDA_FAILED_TO_GET_SETTINGS, {
            cause,
        });
    }
}
