"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.waitForRunning = waitForRunning;
const constants_1 = require("../../constants");
const errors_1 = require("../errors");
const isRunning_1 = require("./isRunning");
const waitForCondition_1 = require("../../waitForCondition");
async function waitForRunning() {
    return await (0, waitForCondition_1.waitForCondition)(() => (0, isRunning_1.isRunning)(), {
        pollTimeout: constants_1.DEFAULT_RUNNING_TIMEOUT,
        timeoutErrorMessage: errors_1.ERR_NVDA_RUNNING_TIMEOUT,
    });
}
