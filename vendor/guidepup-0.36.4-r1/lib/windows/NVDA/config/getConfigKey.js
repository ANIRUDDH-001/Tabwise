"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfigKey = getConfigKey;
const getConfig_1 = require("./getConfig");
function getConfigKey(key) {
    const config = (0, getConfig_1.getConfig)();
    return config[key];
}
