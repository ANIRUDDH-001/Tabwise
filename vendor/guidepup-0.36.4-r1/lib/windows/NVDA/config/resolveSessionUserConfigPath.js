"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveSessionUserConfigPath = resolveSessionUserConfigPath;
const node_path_1 = require("node:path");
const resolveCachePath_1 = require("../../../resolveCachePath");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const manifest = require("../../../../manifest.json");
function resolveSessionUserConfigPath() {
    const asset = manifest.screenReaders.find(({ id }) => id === "nvda")
        .assets[0];
    const cachePath = (0, resolveCachePath_1.resolveCachePath)();
    return (0, node_path_1.join)(cachePath, "nvda", "all", asset.version, "sessionUserConfig");
}
