"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deepMerge = deepMerge;
function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function deepMerge(target, source) {
    const result = { ...target };
    for (const [key, sourceValue] of Object.entries(source)) {
        const targetValue = result[key];
        if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
            result[key] = deepMerge(targetValue, sourceValue);
        }
        else {
            result[key] = sourceValue;
        }
    }
    return result;
}
