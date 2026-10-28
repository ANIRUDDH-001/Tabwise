"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseIni = parseIni;
function splitArray(value) {
    const result = [];
    let current = "";
    let inQuotes = false;
    for (const char of value) {
        if (char === '"') {
            inQuotes = !inQuotes;
        }
        if (char === "," && !inQuotes) {
            if (current) {
                result.push(current.trim());
                current = "";
            }
        }
        else {
            current += char;
        }
    }
    if (current) {
        result.push(current.trim());
    }
    return result;
}
function parseValue(value) {
    if (value === "True") {
        return true;
    }
    if (value === "False") {
        return false;
    }
    const number = Number(value);
    if (!Number.isNaN(number)) {
        return number;
    }
    if (value.endsWith(",")) {
        return splitArray(value.slice(0, -1)).map((item) => item.replace(/^"(.*)"$/, "$1").replace(/\\"/g, '"'));
    }
    return value.replace(/^"(.*)"$/, "$1").replace(/\\"/g, '"');
}
function parseIni(contents) {
    const config = {};
    const sections = {
        0: config,
    };
    let depth = 0;
    for (const line of contents.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
            continue;
        }
        const sectionMatch = trimmed.match(/^(\[+)(.+?)(\]+)$/);
        if (sectionMatch) {
            depth = sectionMatch[1].length;
            const name = sectionMatch[2].trim();
            const parent = sections[depth - 1];
            const section = {};
            parent[name] = section;
            sections[depth] = section;
            continue;
        }
        const separatorIndex = trimmed.indexOf("=");
        if (separatorIndex === -1) {
            continue;
        }
        const key = trimmed.slice(0, separatorIndex).trim();
        const value = trimmed.slice(separatorIndex + 1).trim();
        sections[depth][key] = parseValue(value);
    }
    return config;
}
