"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setConfig = setConfig;
const buildIni_1 = require("./buildIni");
const deepMerge_1 = require("../../../deepMerge");
const errors_1 = require("../../errors");
const getConfig_1 = require("./getConfig");
const node_path_1 = require("node:path");
const resolveSessionUserConfigPath_1 = require("./resolveSessionUserConfigPath");
const node_fs_1 = require("node:fs");
function setConfig(desiredConfig) {
    try {
        const config = (0, getConfig_1.getConfig)();
        const updatedConfig = (0, deepMerge_1.deepMerge)(config, desiredConfig);
        const sessionUserConfigPath = (0, resolveSessionUserConfigPath_1.resolveSessionUserConfigPath)();
        const iniConfigFilePath = (0, node_path_1.join)(sessionUserConfigPath, "nvda.ini");
        const builtConfig = (0, buildIni_1.buildIni)(updatedConfig);
        (0, node_fs_1.writeFileSync)(iniConfigFilePath, builtConfig);
    }
    catch (cause) {
        throw new Error(errors_1.ERR_NVDA_FAILED_TO_SET_SETTING, { cause });
    }
}
