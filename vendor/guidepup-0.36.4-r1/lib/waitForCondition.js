"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.waitForCondition = waitForCondition;
const constants_1 = require("./constants");
const delay_1 = require("./delay");
async function resolveWhenTrue(condition, pollInterval, signal) {
    let result;
    try {
        result = await condition();
    }
    catch {
        result = false;
    }
    if (result || signal.aborted) {
        return;
    }
    await (0, delay_1.delay)(pollInterval);
    await resolveWhenTrue(condition, pollInterval, signal);
}
async function waitForCondition(condition, { pollInterval = constants_1.DEFAULT_POLL_INTERVAL, pollTimeout = constants_1.DEFAULT_TIMEOUT, timeoutErrorMessage = constants_1.ERR_WAITING_TIMEOUT, } = {
    pollInterval: constants_1.DEFAULT_POLL_INTERVAL,
    pollTimeout: constants_1.DEFAULT_TIMEOUT,
    timeoutErrorMessage: constants_1.ERR_WAITING_TIMEOUT,
}) {
    let timeoutTimerId;
    const controller = new AbortController();
    await Promise.race([
        resolveWhenTrue(condition, pollInterval, controller.signal),
        new Promise((_, reject) => {
            timeoutTimerId = setTimeout(() => {
                controller.abort();
                reject(new Error(timeoutErrorMessage));
            }, pollTimeout);
        }),
    ]);
    clearTimeout(timeoutTimerId);
}
