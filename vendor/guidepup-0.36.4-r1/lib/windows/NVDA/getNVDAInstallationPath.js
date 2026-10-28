"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNVDAInstallationPath = getNVDAInstallationPath;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const resolveCachePath_1 = require("../../resolveCachePath");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const manifest = require("../../../manifest.json");
let installationPath;
function getNVDAInstallationPath() {
    if (installationPath) {
        return installationPath;
    }
    const asset = manifest.screenReaders.find(({ id }) => id === "nvda")
        .assets[0];
    const cachePath = (0, resolveCachePath_1.resolveCachePath)();
    const assetPath = (0, node_path_1.join)(cachePath, "nvda", "all", asset.version, "extracted", "nvda.exe");
    if (!(0, node_fs_1.existsSync)(assetPath)) {
        return null;
    }
    installationPath = assetPath;
    return installationPath;
}
