// Modified for R1 (D-39) from @guidepup/guidepup 0.36.4, MIT © 2023 Craig Morten; see VENDORED.md
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NVDAClient = void 0;
const node_tls_1 = require("node:tls");
const node_path_1 = require("node:path");
const errors_1 = require("../errors");
const node_fs_1 = require("node:fs");
const constants_1 = require("./constants");
const constants_2 = require("../../constants");
const delay_1 = require("../../delay");
const node_events_1 = require("node:events");
const getNVDAInstallationPath_1 = require("./getNVDAInstallationPath");
const keyCodeCommands_1 = require("./keyCodeCommands");
const r1Gate_1 = require("../r1Gate");
// R1: a key is sent only as {vk 0-255, scan >= 0, extended boolean}; the bytes are built here, in the
// upstream Key.toJSON field order, never from the key object's own toString.
const validKey = (key) => {
    if (!Number.isInteger(key?.keyCode) || key.keyCode < 0 || key.keyCode > 255 ||
        !Number.isInteger(key.scanCode) || key.scanCode < 0 || typeof key.extended !== "boolean") {
        throw new Error("R1_BAD_KEY");
    }
    return { vk: key.keyCode, scan: key.scanCode, ext: key.extended };
};
const keyMessage = (key, down) => `${JSON.stringify({ scan_code: key.scan, extended: key.ext, vk_code: key.vk, pressed: down, type: "key" })}\n`;
const gateStopped = () => {
    try {
        return r1Gate_1.getGate().isStopped();
    }
    catch {
        return false;
    }
};
const CHANNEL_JOINED = "channel_joined";
const CANCEL = "cancel";
const SPEAK = "speak";
const connectionMessage = JSON.stringify({
    type: "join",
    connection_type: "master",
    channel: "guidepup",
});
const protocolMessage = JSON.stringify({
    type: "protocol_version",
    version: 2,
});
const POLL_INTERVAL = 500;
const MAX_CONSECUTIVE_CONNECTION_FAILURES = 20;
const CANCEL_DEBOUNCE_TIMEOUT = 250;
const CANCEL_NOT_FIRE_TIMEOUT = 1000;
const SPEAK_DEBOUNCE_TIMEOUT = 1000;
const isChannelJoinedMessage = (message) => {
    return message.type === CHANNEL_JOINED;
};
const isCancelMessage = (message) => {
    return message.type === CANCEL;
};
const isSpeakMessage = (message) => {
    return message.type === SPEAK;
};
class NVDAClient extends node_events_1.EventEmitter {
    #inFlight = null;
    #queue = [];
    #stopped = false;
    #socket = null;
    #spokenPhrases = [];
    #consecutiveConnectionFailures = 0;
    #capture;
    // R1: set once the socket has failed after a successful connect; there is no reconnect.
    #dead = false;
    /**
     * Get the log of all spoken phrases for this NVDA connection.
     *
     * @returns {Promise<string[]>} All spoken phrases
     */
    async spokenPhraseLog() {
        await this.#waitForAllActions();
        return this.#spokenPhrases;
    }
    /**
     * Clear the log of all spoken phrases for this NVDA connection.
     */
    async clearSpokenPhraseLog() {
        await this.#waitForAllActions();
        this.#spokenPhrases = [];
    }
    /**
     * Connect to a NVDA instance.
     */
    async connect(options) {
        const executablePath = (0, getNVDAInstallationPath_1.getNVDAInstallationPath)();
        if (!executablePath) {
            throw new Error(errors_1.ERR_NVDA_NOT_INSTALLED);
        }
        const caPath = (0, node_path_1.join)((0, node_path_1.dirname)(executablePath), "userConfig", "remoteAccess", "localRelay", "NvdaRemoteRelay.pem");
        const legacyCaPath = (0, node_path_1.join)((0, node_path_1.dirname)(executablePath), "userConfig", "addons", "remote", "globalPlugins", "remoteClient", "server.pem");
        const caFile = (0, node_fs_1.existsSync)(caPath) ? caPath : legacyCaPath;
        let ca;
        try {
            ca = (0, node_fs_1.readFileSync)(caFile);
        }
        catch {
            throw new Error(errors_1.ERR_NVDA_NOT_INSTALLED);
        }
        return await new Promise((resolve, reject) => {
            let finished = false;
            const done = (error) => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                if (!error && gateStopped()) error = new Error("NVDA connect cancelled");
                if (error) { this.#dead = true; this.disconnect(); reject(error); } else resolve();
            };
            const ms = Math.min(5000, options?.deadlineMs ? options.deadlineMs - performance.now() : 5000);
            const timer = setTimeout(() => done(new Error("NVDA connection handshake timed out")), Math.max(1, ms));
            if (ms <= 0 || gateStopped()) { done(new Error("NVDA connect refused after stop/deadline")); return; }
            this.#connect(ca, options?.capture, () => done(null), done).catch(done);
        });
    }
    async #connect(ca, capture = constants_2.DEFAULT_CAPTURE, onSuccess, onError) {
        if (this.#dead || gateStopped()) { onError(new Error("NVDA connection stopped")); return; }
        let onSuccessCalled = false;
        const onReady = () => {
            this.#consecutiveConnectionFailures = 0;
            this.#capture = capture;
            onSuccessCalled = true;
            onSuccess?.();
        };
        // R1: connected only once the channel is joined and both handshake writes have completed, so no
        // handshake write can interleave with a key; a failed handshake rejects connect.
        let joined = false;
        let shaken = false;
        const onJoined = () => {
            joined = true;
            if (shaken) {
                onReady();
            }
        };
        this.#socket = (0, node_tls_1.connect)(constants_1.NVDA_PORT, constants_1.NVDA_HOST, {
            ca: [ca],
            checkServerIdentity: () => null,
        }, async () => {
            this.once(CHANNEL_JOINED, onJoined);
            try {
                await this.#handshake(connectionMessage);
                await this.#handshake(protocolMessage);
            }
            catch (cause) {
                this.off(CHANNEL_JOINED, onJoined);
                this.disconnect();
                this.#dead = true;
                onError(new Error(errors_1.ERR_NVDA_CANNOT_CONNECT, { cause }));
                return;
            }
            shaken = true;
            if (joined) {
                onReady();
            }
        });
        this.#socket.setEncoding("utf8");
        this.#socket.on("error", (cause) => {
            if (this.#socket !== socket) return;
            this.off(CHANNEL_JOINED, onJoined);
            if (onSuccessCalled) {
                protocolError(`connection error: ${cause.message}`);
                return;
            }
            this.disconnect();
            this.#consecutiveConnectionFailures++;
            // R1: retries happen only before the first connect, and end once the gate has stopped.
            if (this.#consecutiveConnectionFailures <
                MAX_CONSECUTIVE_CONNECTION_FAILURES && !gateStopped() && !this.#dead) {
                setTimeout(() => {
                    if (gateStopped() || this.#dead) {
                        onError(new Error(errors_1.ERR_NVDA_CANNOT_CONNECT, { cause }));
                        return;
                    }
                    this.#connect(ca, capture, onSuccess, onError);
                }, POLL_INTERVAL);
                return;
            }
            onError(new Error(errors_1.ERR_NVDA_CANNOT_CONNECT, { cause }));
        });
        // D-43: TLS chunks have no message boundaries. NVDA Remote uses newline-delimited JSON.
        const socket = this.#socket;
        let pending = "";
        let failed = false;
        const protocolError = (reason) => {
            if (failed) return;
            failed = true;
            this.#dead = true;
            try { (0, r1Gate_1.getGate)().stop(`NVDA protocol: ${reason}`, "send"); } catch { }
            this.off(CHANNEL_JOINED, onJoined);
            this.disconnect();
            if (!onSuccessCalled) onError(new Error(`NVDA protocol: ${reason}`));
        };
        const message = (parsedData) => {
            if (!parsedData || typeof parsedData !== "object" || typeof parsedData.type !== "string") {
                protocolError("invalid message");
                return;
            }
            if (isChannelJoinedMessage(parsedData)) {
                this.emit(CHANNEL_JOINED);
                return;
            }
            if (isCancelMessage(parsedData)) {
                this.emit(CANCEL);
                return;
            }
            if (!isSpeakMessage(parsedData)) {
                return;
            }
            if (!Array.isArray(parsedData.sequence)) {
                protocolError("invalid speech sequence");
                return;
            }
            const spokenPhraseParts = [];
            for (const spokenPhrasePart of parsedData.sequence) {
                if (typeof spokenPhrasePart !== "string") {
                    continue;
                }
                spokenPhraseParts.push(spokenPhrasePart.trim().replaceAll(/\s\s+/g, " "));
            }
            const spokenPhrase = spokenPhraseParts.join(", ");
            this.emit(SPEAK, spokenPhrase);
        };
        socket.on("data", (data) => {
            if (failed || this.#socket !== socket) return;
            pending += String(data);
            let end;
            while ((end = pending.indexOf("\n")) >= 0) {
                const line = pending.slice(0, end).trim();
                pending = pending.slice(end + 1);
                if (!line) continue;
                if (Buffer.byteLength(line, "utf8") > 1024 * 1024) { protocolError("frame too large"); return; }
                let parsed;
                try { parsed = JSON.parse(line); }
                catch { protocolError("malformed JSON"); return; }
                message(parsed);
                if (failed) return;
            }
            if (Buffer.byteLength(pending, "utf8") > 1024 * 1024) protocolError("frame too large");
        });
        socket.on("end", () => { if (this.#socket === socket) protocolError(pending.trim() ? "truncated frame at EOF" : "connection ended"); });
        socket.on("close", () => { if (this.#socket === socket) protocolError("connection closed"); });
    }
    /**
     * Disconnect the NVDA connection.
     */
    disconnect() {
        const socket = this.#socket;
        this.#socket = null;
        this.#capture = null;
        try {
            socket?.destroy();
        }
        catch {
            // swallow
        }
    }
    /**
     * Stop NVDA action execution.
     */
    async stop() {
        this.#stopped = true;
        await this.#waitForAllActions();
        this.disconnect();
    }
    /**
     * Send a Key Code command to NVDA.
     *
     * @param {object} keyCommand Key Code command to send to NVDA.
     */
    async sendKeyCode(keyCommand) {
        const gate = r1Gate_1.getGate();
        const modifiers = keyCommand.modifiers ? keyCommand.modifiers : [];
        const keyCodes = keyCommand.keyCode
            ? Array.isArray(keyCommand.keyCode)
                ? keyCommand.keyCode
                : [keyCommand.keyCode]
            : [];
        const keys = [...modifiers, ...keyCodes].map(validKey);
        if (keys.length === 0) {
            throw new Error("R1_BAD_KEY");
        }
        await this.#sendChord(gate, keys);
    }
    /**
     * Stops the current spoken phrase, executes the provided action, and waits
     * for the associated spoken phrase. Actions are executed serially in the
     * order they are enqueued.
     *
     * @param {() => Promise<T>} action Underlying action to capture logs for.
     * @param {object} options Additional options.
     * @returns {Promise<T>} Promise that resolves with the action's result.
     */
    enqueueAndTap(action, options) {
        if (this.#stopped) {
            throw new Error(errors_1.ERR_NVDA_NOT_RUNNING);
        }
        let resolve, reject;
        const promise = new Promise((_resolve, _reject) => {
            resolve = _resolve;
            reject = _reject;
        });
        this.#queue.push({ action, options, promise, resolve, reject });
        this.#processQueue();
        return promise;
    }
    async #waitForAllActions() {
        const allPromises = this.#queue.map(({ promise }) => promise);
        if (this.#inFlight) {
            allPromises.push(this.#inFlight);
        }
        await Promise.allSettled(allPromises);
    }
    async #processQueue() {
        if (this.#inFlight || this.#queue.length === 0) {
            return;
        }
        const { action, options, resolve, reject, promise } = this.#queue.shift();
        this.#inFlight = promise;
        try {
            if (this.#stopped) {
                throw new Error(errors_1.ERR_NVDA_NOT_RUNNING);
            }
            const spokenPhrases = [];
            let result;
            if (options?.capture ?? this.#capture) {
                await this.#stopReading();
                let speakPromiseResolver;
                const speakPromise = new Promise((resolve) => {
                    speakPromiseResolver = resolve;
                });
                let timeoutId = null;
                const speakHandler = (spokenPhrase) => {
                    spokenPhrases.push(spokenPhrase);
                    if ((options?.capture ?? this.#capture) === "initial") {
                        clearTimeout(timeoutId);
                        this.removeListener(SPEAK, speakHandler);
                        speakPromiseResolver();
                    }
                    else if (timeoutId !== null) {
                        clearTimeout(timeoutId);
                        timeoutId = setTimeout(timeoutHandler, SPEAK_DEBOUNCE_TIMEOUT);
                    }
                };
                const timeoutHandler = () => {
                    this.removeListener(SPEAK, speakHandler);
                    speakPromiseResolver();
                };
                this.addListener(SPEAK, speakHandler);
                result = await action();
                timeoutId = setTimeout(timeoutHandler, SPEAK_DEBOUNCE_TIMEOUT);
                await speakPromise;
                timeoutId = null;
            }
            else {
                result = await action();
            }
            const spokenPhrase = spokenPhrases.join(". ");
            this.#spokenPhrases.push(spokenPhrase);
            resolve({
                itemText: spokenPhrase ?? "",
                result,
                spokenPhrase: spokenPhrase ?? "",
            });
        }
        catch (error) {
            reject(error);
        }
        finally {
            this.#inFlight = null;
            this.#processQueue();
        }
    }
    async #stopReading() {
        let spoken = true;
        let cancelPromiseResolver = () => null;
        const speakHandler = () => {
            spoken = true;
        };
        const cancelHandler = () => {
            cancelPromiseResolver();
        };
        this.addListener(SPEAK, speakHandler);
        try {
            while (spoken) {
                spoken = false;
                const cancelPromise = new Promise((resolve) => {
                    cancelPromiseResolver = resolve;
                });
                this.once(CANCEL, cancelHandler);
                // R1: awaited, so a refused or failed stop-speech rejects the action before its key.
                await this.sendKeyCode(keyCodeCommands_1.keyCodeCommands.stopSpeech);
                await Promise.race([cancelPromise, (0, delay_1.delay)(CANCEL_NOT_FIRE_TIMEOUT)]);
                cancelPromiseResolver();
                cancelPromiseResolver = () => null;
                await (0, delay_1.delay)(CANCEL_DEBOUNCE_TIMEOUT);
            }
        }
        finally {
            this.removeListener(CANCEL, cancelHandler);
            this.removeListener(SPEAK, speakHandler);
        }
    }
    // R1: the only non-key writes are the two handshake messages; no reconnect.
    #handshake(message) {
        if (message !== connectionMessage && message !== protocolMessage) {
            throw new Error("R1_REFUSED: not a handshake message");
        }
        const socket = this.#socket;
        if (!socket || socket.destroyed) {
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            socket.write(`${message}\n`, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });
    }
    // R1: one chord per gate admission. admit (bounded foreground check), then in the same turn commit and
    // queue every key-down and the key-ups in reverse; the dispatch ends at the last write callback,
    // bounded by writeMs. After a timeout the socket is ended (flush, bounded by killMs) and destroyed;
    // bytes already queued cannot be recalled. release() then runs the page ack and the post-check.
    async #sendChord(gate, keys) {
        const socket = this.#socket;
        const usable = () => this.#socket === socket && socket !== null && !socket.destroyed && !this.#dead;
        if (!usable()) {
            gate.stop("NVDA socket missing or closed; no key sent", "pre");
            throw new Error("R1_NO_SOCKET");
        }
        const token = await gate.admit({ path: "nvda", keys });
        if (!usable()) {
            gate.stop("NVDA socket closed during the check; no key sent", "pre");
            throw new Error("R1_NO_SOCKET");
        }
        if (!gate.commit(token)) {
            throw new Error("R1_REFUSED: commit");
        }
        const messages = [...keys.map((key) => keyMessage(key, true)), ...[...keys].reverse().map((key) => keyMessage(key, false))];
        let error = null;
        let timer;
        try {
            const written = new Promise((resolve) => {
                let pending = messages.length;
                let first = null;
                const done = (err) => {
                    first ??= err ?? null;
                    if (--pending === 0) {
                        resolve(first);
                    }
                };
                for (const message of messages) {
                    socket.write(message, done);
                }
            }).catch((e) => e);
            const timedOut = new Promise((resolve) => {
                timer = setTimeout(() => resolve("timeout"), gate.bounds.writeMs);
            });
            const result = await Promise.race([written, timedOut]);
            if (result === "timeout") {
                error = "write callback timed out";
                await this.#closeAfterTimeout(socket, gate.bounds.killMs);
            }
            else if (result) {
                error = result.message ?? String(result);
            }
        }
        catch (e) {
            error = e?.message ?? String(e);
        }
        finally {
            clearTimeout(timer);
        }
        await gate.release(token, { error, ended: true });
        if (error) {
            throw new Error(`R1_SEND_FAILED: ${error}`);
        }
    }
    async #closeAfterTimeout(socket, killMs) {
        this.#dead = true;
        let timer;
        try {
            const finished = new Promise((resolve) => socket.once("finish", resolve));
            socket.end();
            await Promise.race([finished, new Promise((resolve) => { timer = setTimeout(resolve, killMs); })]);
        }
        catch {
            // best effort
        }
        finally {
            clearTimeout(timer);
        }
        try {
            socket.destroy();
        }
        catch {
            // best effort
        }
        if (this.#socket === socket) {
            this.#socket = null;
        }
    }
}
Object.freeze(NVDAClient.prototype);
Object.freeze(NVDAClient);
exports.NVDAClient = NVDAClient;
Object.freeze(exports);
