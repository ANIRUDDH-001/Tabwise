"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveCachePath = resolveCachePath;
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const defaultCacheLocationMap = {
    darwin: (0, node_path_1.resolve)((0, node_os_1.homedir)(), "Library", "Caches", "guidepup"),
    win32: (0, node_path_1.resolve)(process.env.LOCALAPPDATA ?? (0, node_path_1.join)((0, node_os_1.homedir)(), "AppData", "Local"), "guidepup"),
};
const defaultCacheLocation = (0, node_path_1.resolve)((0, node_os_1.homedir)(), ".cache", "guidepup");
function resolveCachePath() {
    const currentPlatform = (0, node_os_1.platform)();
    const cacheLocationOverride = process.env.GUIDEPUP_SCREEN_READERS_PATH;
    const resolvedCacheLocation = cacheLocationOverride
        ? (0, node_path_1.resolve)(cacheLocationOverride)
        : (defaultCacheLocationMap[currentPlatform] ?? defaultCacheLocation);
    return resolvedCacheLocation;
}
