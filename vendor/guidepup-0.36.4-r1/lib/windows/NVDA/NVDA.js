// Modified for R1 (D-39) from @guidepup/guidepup 0.36.4, MIT © 2023 Craig Morten; see VENDORED.md
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NVDA = void 0;
const teardown_1 = require("../../teardown");
const config_1 = require("./config");
const errors_1 = require("../errors");
const isNVDAInstalled_1 = require("./isNVDAInstalled");
const isWindows_1 = require("../isWindows");
const keyCodeCommands_1 = require("./keyCodeCommands");
const Key_1 = require("../Key");
const KeyCodes_1 = require("../KeyCodes");
const Modifiers_1 = require("../Modifiers");
const NVDAClient_1 = require("./NVDAClient");
const parseKey_1 = require("../../parseKey");
const quit_1 = require("./quit");
const sendKeys_1 = require("../sendKeys");
const start_1 = require("./start");
const r1Gate_1 = require("../r1Gate");
const within = (p, deadline) => {
    let timer;
    return Promise.race([Promise.resolve(p), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("NVDA lifecycle deadline exhausted")), Math.max(1, deadline - performance.now())); })]).finally(() => clearTimeout(timer));
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const manifest = require("../../../manifest.json");
/**
 * Class for controlling the NVDA screen reader on Windows.
 */
class NVDA {
    /**
     * NVDA client.
     */
    #client;
    #owned = null;
    /**
     * NVDA running status.
     */
    #started = false;
    /**
     * NVDA startup status.
     */
    #starting = false;
    /**
     * NVDA stopping status.
     */
    #stopping = false;
    /**
     * Attempt to stop NVD and teardown config when the process is terminating.
     */
    #teardownAfterTermination = async () => {
        const errors = [];
        const deadline = performance.now() + 9000;
        try {
            await within(this.#client?.stop(), deadline);
        }
        catch (e) { errors.push(e); }
        this.#client = null;
        try {
            await (0, quit_1.quit)({ owned: this.#owned, deadlineMs: deadline });
            this.#owned = null;
        }
        catch (e) { errors.push(e); }
        try {
            if (!errors.length) (0, config_1.deleteGuidepupConfig)();
        }
        catch (e) { errors.push(e); }
        this.#started = false;
        this.#starting = false;
        this.#stopping = false;
        if (errors.length) throw new AggregateError(errors, "NVDA cleanup incomplete");
    };
    /**
     * Handler for teardown should the process be interrupted, killed, etc.
     */
    #teardownHandler = async () => {
        (0, teardown_1.removeTeardownHandler)(this.#teardownHandler);
        await this.#teardownAfterTermination();
    };
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-name)
     *
     * The screen reader name.
     */
    get name() {
        return "NVDA";
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-version)
     *
     * The screen reader version.
     */
    get version() {
        return manifest.screenReaders.find(({ id }) => id === "nvda").assets[0]
            .version;
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-keyboard-commands)
     *
     * Getter for all NVDA keyboard commands.
     *
     * Use with the NVDA `perform` command to invoke a keyboard action:
     *
     * ```ts
     * import { nvda } from "@guidepup/guidepup";
     *
     * (async () => {
     *   // Start NVDA.
     *   await nvda.start();
     *
     *   // Move to the next item.
     *   await nvda.perform(nvda.keyboardCommands.moveToNext);
     *
     *   // Stop NVDA.
     *   await nvda.stop();
     * })();
     * ```
     */
    get keyboardCommands() {
        return keyCodeCommands_1.keyCodeCommands;
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-detect)
     *
     * Detect whether NVDA is supported for the current OS:
     *
     * - `true` for Windows
     * - `false` for macOS
     * - `false` for Linux
     *
     * ```ts
     * import { NVDA } from "@guidepup/guidepup";
     *
     * (async () => {
     *   const isNVDADefaultScreenReader = NVDA.detect();
     *
     *   console.log(isNVDADefaultScreenReader);
     * })();
     * ```
     *
     * @returns {boolean}
     */
    static detect() {
        return (0, isWindows_1.isWindows)();
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-detect)
     *
     * Detect whether NVDA is supported for the current OS:
     *
     * - `true` for Windows
     * - `false` for macOS
     * - `false` for Linux
     *
     * ```ts
     * import { nvda } from "@guidepup/guidepup";
     *
     * (async () => {
     *   const isNVDADefaultScreenReader = nvda.detect();
     *
     *   console.log(isNVDADefaultScreenReader);
     * })();
     * ```
     *
     * @returns {boolean}
     */
    detect() {
        return NVDA.detect();
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-default)
     *
     * Detect whether NVDA is the default screen reader for the current OS:
     *
     * - `true` for Windows
     * - `false` for macOS
     * - `false` for Linux
     *
     * ```ts
     * import { NVDA } from "@guidepup/guidepup";
     *
     * (async () => {
     *   const isNVDADefaultScreenReader = NVDA.default();
     *
     *   console.log(isNVDADefaultScreenReader);
     * })();
     * ```
     *
     * @returns {boolean}
     */
    static default() {
        return (0, isWindows_1.isWindows)();
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-default)
     *
     * Detect whether NVDA is the default screen reader for the current OS:
     *
     * - `true` for Windows
     * - `false` for macOS
     * - `false` for Linux
     *
     * ```ts
     * import { nvda } from "@guidepup/guidepup";
     *
     * (async () => {
     *   const isNVDADefaultScreenReader = nvda.default();
     *
     *   console.log(isNVDADefaultScreenReader);
     * })();
     * ```
     *
     * @returns {boolean}
     */
    default() {
        return NVDA.default();
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-start)
     *
     * Turn NVDA on.
     *
     * ```ts
     * import { nvda } from "@guidepup/guidepup";
     *
     * (async () => {
     *   // Start NVDA.
     *   await nvda.start();
     *
     *   // ... perform some commands.
     *
     *   // Stop NVDA.
     *   await nvda.stop();
     * })();
     * ```
     *
     * Note: By default the `capture` option is set to `"initial"` to capture the
     * first "page" of output, but not any subsequent content. To enable full
     * capture set `{ capture: true }`, or to disable capture set
     * `{ capture: false }`.
     */
    async start(options) {
        if (!this.detect()) {
            throw new Error(errors_1.ERR_NVDA_NOT_SUPPORTED);
        }
        if (!(0, isNVDAInstalled_1.isNVDAInstalled)()) {
            throw new Error(errors_1.ERR_NVDA_NOT_INSTALLED);
        }
        if (this.#started || this.#starting) {
            throw new Error(errors_1.ERR_NVDA_ALREADY_RUNNING);
        }
        this.#starting = true;
        const deadline = performance.now() + 27000;
        (0, teardown_1.addTeardownHandler)(this.#teardownHandler);
        try {
            const reset = await (0, quit_1.quit)({ deadlineMs: deadline, owned: this.#owned });
            (0, config_1.createGuidepupConfig)();
            if (options?.settings) {
                (0, config_1.setConfig)(options.settings);
            }
            this.#owned = await (0, start_1.start)({ deadlineMs: deadline });
            this.#owned.process.once("exit", () => {
                if (this.#started && !this.#stopping) {
                    (0, r1Gate_1.getGate)().stop("owned NVDA process exited", "send");
                    this.#client?.disconnect();
                }
            });
            this.#client = new NVDAClient_1.NVDAClient();
            await within(this.#client.connect({ ...options, deadlineMs: deadline }), deadline);
            if (!this.#owned.isAlive() || (0, r1Gate_1.getGate)().isStopped()) throw new Error("owned NVDA process exited or startup was stopped during connect");
            const relayPid = await (0, start_1.relayOwnerPid)({ deadlineMs: deadline });
            if (relayPid !== this.#owned.pid || !this.#owned.isAlive() || (0, r1Gate_1.getGate)().isStopped() || performance.now() >= deadline) throw new Error("NVDA relay/process ownership not established");
            this.#started = true;
            return { pid: this.#owned.pid, relay_pid: relayPid, reset_confirmed: reset.listener_stopped === true };
        }
        catch (cause) {
            (0, r1Gate_1.getGate)().stop("NVDA startup failed", "pre");
            if (!this.#owned && cause.ownedProcess) this.#owned = cause.ownedProcess;
            const error = new Error(errors_1.ERR_NVDA_CANNOT_BE_STARTED, { cause });
            try { await this.#teardownHandler(); }
            catch (cleanup) { error.cleanup_errors = (cleanup.errors ?? [cleanup]).map((e) => `${e.message}${e.cause?.message ? `: ${e.cause.message}` : ""}`); }
            throw error;
        }
        finally {
            this.#starting = false;
        }
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-stop)
     *
     * Turn NVDA off.
     *
     * ```ts
     * import { nvda } from "@guidepup/guidepup";
     *
     * (async () => {
     *   // Start NVDA.
     *   await nvda.start();
     *
     *   // ... perform some commands.
     *
     *   // Stop NVDA.
     *   await nvda.stop();
     * })();
     * ```
     */
    async stop() {
        if (!this.#started && !this.#owned) {
            throw new Error(errors_1.ERR_NVDA_NOT_RUNNING);
        }
        this.#stopping = true;
        const deadline = performance.now() + 9000;
        try {
            await within(this.#client?.stop(), deadline);
            this.#client = null;
            await (0, quit_1.quit)({ owned: this.#owned, deadlineMs: deadline });
            this.#owned = null;
            (0, config_1.deleteGuidepupConfig)();
            (0, teardown_1.removeTeardownHandler)(this.#teardownHandler);
            this.#started = false;
        }
        finally {
            this.#stopping = false;
        }
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-previous)
     *
     * Move the NVDA cursor to the previous location.
     *
     * Equivalent of executing `Up Arrow`.
     *
     * ```ts
     * import { nvda } from "@guidepup/guidepup";
     *
     * (async () => {
     *   // Start NVDA.
     *   await nvda.start();
     *
     *   // Move to the previous item.
     *   await nvda.previous();
     *
     *   // Stop NVDA.
     *   await nvda.stop();
     * })();
     * ```
     */
    async previous(options) {
        if (!this.#started || this.#stopping) {
            throw new Error(errors_1.ERR_NVDA_NOT_RUNNING);
        }
        await this.#client.enqueueAndTap(() => this.#client.sendKeyCode(keyCodeCommands_1.keyCodeCommands.moveToPrevious), options);
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-next)
     *
     * Move the NVDA cursor to the next location.
     *
     * Equivalent of executing `Down Arrow`.
     *
     * ```ts
     * import { nvda } from "@guidepup/guidepup";
     *
     * (async () => {
     *   // Start NVDA.
     *   await nvda.start();
     *
     *   // Move to the next item.
     *   await nvda.next();
     *
     *   // Stop NVDA.
     *   await nvda.stop();
     * })();
     * ```
     */
    async next(options) {
        if (!this.#started || this.#stopping) {
            throw new Error(errors_1.ERR_NVDA_NOT_RUNNING);
        }
        await this.#client.enqueueAndTap(() => this.#client.sendKeyCode(keyCodeCommands_1.keyCodeCommands.moveToNext), options);
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-previous-heading)
     *
     * Move the NVDA cursor to the previous heading.
     *
     * Equivalent of executing `Shift-H`.
     *
     * ```ts
     * import { nvda } from "@guidepup/guidepup";
     *
     * (async () => {
     *   // Start NVDA.
     *   await nvda.start();
     *
     *   // Move to the previous heading.
     *   await nvda.previousHeading();
     *
     *   // Stop NVDA.
     *   await nvda.stop();
     * })();
     * ```
     *
     * @param {object} [options] Additional options.
     */
    async previousHeading(options) {
        if (!this.#started || this.#stopping) {
            throw new Error(errors_1.ERR_NVDA_NOT_RUNNING);
        }
        return this.perform(this.keyboardCommands.moveToPreviousHeading, options);
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-next-heading)
     *
     * Move the NVDA cursor to the next heading.
     *
     * Equivalent of executing `H`.
     *
     * ```ts
     * import { nvda } from "@guidepup/guidepup";
     *
     * (async () => {
     *   // Start NVDA.
     *   await nvda.start();
     *
     *   // Move to the next heading.
     *   await nvda.nextHeading();
     *
     *   // Stop NVDA.
     *   await nvda.stop();
     * })();
     * ```
     *
     * @param {object} [options] Additional options.
     */
    async nextHeading(options) {
        if (!this.#started || this.#stopping) {
            throw new Error(errors_1.ERR_NVDA_NOT_RUNNING);
        }
        return this.perform(this.keyboardCommands.moveToNextHeading, options);
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-previous-link)
     *
     * Move the NVDA cursor to the previous link.
     *
     * Equivalent of executing `Shift-K`.
     *
     * ```ts
     * import { nvda } from "@guidepup/guidepup";
     *
     * (async () => {
     *   // Start NVDA.
     *   await nvda.start();
     *
     *   // Move to the previous link.
     *   await nvda.previousLink();
     *
     *   // Stop NVDA.
     *   await nvda.stop();
     * })();
     * ```
     *
     * @param {object} [options] Additional options.
     */
    async previousLink(options) {
        if (!this.#started || this.#stopping) {
            throw new Error(errors_1.ERR_NVDA_NOT_RUNNING);
        }
        return this.perform(this.keyboardCommands.moveToPreviousLink, options);
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-next-link)
     *
     * Move the NVDA cursor to the next link.
     *
     * Equivalent of executing `K`.
     *
     * ```ts
     * import { nvda } from "@guidepup/guidepup";
     *
     * (async () => {
     *   // Start NVDA.
     *   await nvda.start();
     *
     *   // Move to the next link.
     *   await nvda.nextLink();
     *
     *   // Stop NVDA.
     *   await nvda.stop();
     * })();
     * ```
     *
     * @param {object} [options] Additional options.
     */
    async nextLink(options) {
        if (!this.#started || this.#stopping) {
            throw new Error(errors_1.ERR_NVDA_NOT_RUNNING);
        }
        return this.perform(this.keyboardCommands.moveToNextLink, options);
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-previous-landmark)
     *
     * Move the NVDA cursor to the previous landmark.
     *
     * Equivalent of executing `Shift-D`.
     *
     * ```ts
     * import { nvda } from "@guidepup/guidepup";
     *
     * (async () => {
     *   // Start NVDA.
     *   await nvda.start();
     *
     *   // Move to the previous landmark.
     *   await nvda.previousLandmark();
     *
     *   // Stop NVDA.
     *   await nvda.stop();
     * })();
     * ```
     *
     * @param {object} [options] Additional options.
     */
    async previousLandmark(options) {
        if (!this.#started || this.#stopping) {
            throw new Error(errors_1.ERR_NVDA_NOT_RUNNING);
        }
        return this.perform(this.keyboardCommands.moveToPreviousLandmark, options);
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-next-landmark)
     *
     * Move the NVDA cursor to the next landmark.
     *
     * Equivalent of executing `D`.
     *
     * ```ts
     * import { nvda } from "@guidepup/guidepup";
     *
     * (async () => {
     *   // Start NVDA.
     *   await nvda.start();
     *
     *   // Move to the next landmark.
     *   await nvda.nextLandmark();
     *
     *   // Stop NVDA.
     *   await nvda.stop();
     * })();
     * ```
     *
     * @param {object} [options] Additional options.
     */
    async nextLandmark(options) {
        if (!this.#started || this.#stopping) {
            throw new Error(errors_1.ERR_NVDA_NOT_RUNNING);
        }
        return this.perform(this.keyboardCommands.moveToNextLandmark, options);
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-act)
     *
     * Perform the default action for the item in the NVDA cursor.
     *
     * Equivalent of executing `Enter`.
     *
     * ```ts
     * import { nvda } from "@guidepup/guidepup";
     *
     * (async () => {
     *   // Start NVDA.
     *   await nvda.start();
     *
     *   // Move to the next item.
     *   await nvda.next();
     *
     *   // Perform the default action for the item.
     *   await nvda.act();
     *
     *   // Stop NVDA.
     *   await nvda.stop();
     * })();
     * ```
     */
    async act(options) {
        if (!this.#started || this.#stopping) {
            throw new Error(errors_1.ERR_NVDA_NOT_RUNNING);
        }
        await this.#client.enqueueAndTap(() => this.#client.sendKeyCode(keyCodeCommands_1.keyCodeCommands.activate), options);
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-interact)
     *
     * No-op to provide same API across screen-readers.
     *
     * NVDA does not require users to perform an additional command to interact
     * with the item in the NVDA cursor.
     */
    async interact() {
        if (!this.#started || this.#stopping) {
            throw new Error(errors_1.ERR_NVDA_NOT_RUNNING);
        }
        return Promise.resolve();
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-stop-interacting)
     *
     * No-op to provide same API across screen-readers.
     *
     * NVDA does not require users to perform an additional command to interact
     * with the item in the NVDA cursor.
     */
    async stopInteracting() {
        if (!this.#started || this.#stopping) {
            throw new Error(errors_1.ERR_NVDA_NOT_RUNNING);
        }
        return Promise.resolve();
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-press)
     *
     * Press a key on the focused item.
     *
     * `key` can specify the intended [keyboardEvent.key](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key)
     * value or a single character to generate the text for. A superset of the `key` values can be found
     * [on the MDN key values page](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values). Examples of the keys are:
     *
     * `F1` - `F20`, `Digit0` - `Digit9`, `KeyA` - `KeyZ`, `Backquote`, `Minus`, `Equal`, `Backslash`, `Backspace`, `Tab`,
     * `Delete`, `Escape`, `ArrowDown`, `End`, `Enter`, `Home`, `Insert`, `PageDown`, `PageUp`, `ArrowRight`, `ArrowUp`, etc.
     *
     * See [WindowsKeyCodes](https://www.guidepup.dev/docs/api/class-windows-key-codes) for the full range of available keys.
     *
     * Following modification shortcuts are also supported: `Shift`, `Control`, `Alt`.
     *
     * See [WindowsModifiers](https://www.guidepup.dev/docs/api/class-windows-modifiers) for the full range of available modifiers.
     *
     * Holding down `Shift` will type the text that corresponds to the `key` in the upper case.
     *
     * If `key` is a single character, it is case-sensitive, so the values `a` and `A` will generate different respective
     * texts.
     *
     * Shortcuts such as `key: "Control+f"` or `key: "Control+Shift+f"` are supported as well. When specified with the
     * modifier, modifier is pressed and being held while the subsequent key is being pressed.
     *
     * ```ts
     * import { nvda } from "@guidepup/guidepup";
     *
     * (async () => {
     *   // Start NVDA.
     *   await nvda.start();
     *
     *   // Open a find text modal.
     *   await nvda.press("Control+f");
     *
     *   // Stop NVDA.
     *   await nvda.stop();
     * })();
     * ```
     *
     * @param {string} key Name of the key to press or a character to generate, such as `ArrowLeft` or `a`.
     */
    async press(key, options) {
        if (!this.#started || this.#stopping) {
            throw new Error(errors_1.ERR_NVDA_NOT_RUNNING);
        }
        return this.perform((0, parseKey_1.parseKey)(key, Modifiers_1.Modifiers, KeyCodes_1.KeyCodes), options);
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-type)
     *
     * Type text into the focused item.
     *
     * To press a special key, like `Control` or `ArrowDown`, use `nvda.press(key[, options])`.
     *
     * ```ts
     * import { nvda } from "@guidepup/guidepup";
     *
     * (async () => {
     *   // Start NVDA.
     *   await nvda.start();
     *
     *   // Type a username and key Enter.
     *   await nvda.type("my-username");
     *   await nvda.press("Enter");
     *
     *   // Stop NVDA.
     *   await nvda.stop();
     * })();
     * ```
     *
     * Note: Each character is typed separately for this command. This means
     * calling `await nvda.lastSpokenPhrase()` will yield the last spoken phrase
     * for the last character in the typed string. If you need access to the
     * spoken phrase(s) for the entire typed string then use
     * `await nvda.spokenPhraseLog()`.
     *
     * @param {string} text Text to type into the focused item.
     */
    async type(text, options) {
        if (!this.#started || this.#stopping) {
            throw new Error(errors_1.ERR_NVDA_NOT_RUNNING);
        }
        for (const character of text) {
            await this.#client.enqueueAndTap(() => (0, sendKeys_1.sendKeys)({ characters: character }), options);
        }
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-perform)
     *
     * Perform a NVDA command.
     *
     * The command can be a [WindowsKeyCodeCommand](https://www.guidepup.dev/docs/api/class-windows-key-code-command) or [WindowsKeystrokeCommand](https://www.guidepup.dev/docs/api/class-windows-keystroke-command).
     *
     * ```ts
     * import { nvda, NVDAKeyCodeCommands } from "@guidepup/guidepup";
     *
     * (async () => {
     *   // Start NVDA.
     *   await nvda.start();
     *
     *   // Type using a custom keystroke command.
     *   await nvda.perform({ characters: "my-username" });
     *
     *   // Keyboard commands available on the NVDA instance.
     *   await nvda.perform(nvda.keyboardCommands.performDefaultActionForItem);
     *
     *   // Stop NVDA.
     *   await nvda.stop();
     * })();
     * ```
     *
     * @param {any} command NVDA keyboard command to execute.
     */
    async perform(command, options) {
        if (!this.#started || this.#stopping) {
            throw new Error(errors_1.ERR_NVDA_NOT_RUNNING);
        }
        await this.#client.enqueueAndTap(() => this.#client.sendKeyCode(command), options);
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-click)
     *
     * Click the mouse.
     *
     * ```ts
     * import { nvda } from "@guidepup/guidepup";
     *
     * (async () => {
     *   // Start NVDA.
     *   await nvda.start();
     *
     *   // Left-click the mouse.
     *   await nvda.click();
     *
     *   // Left-click the mouse using specific options.
     *   await nvda.click({ button: "left", clickCount: 1 });
     *
     *   // Double-right-click the mouse.
     *   await nvda.click({ button: "right", clickCount: 2 });
     *
     *   // Stop NVDA.
     *   await nvda.stop();
     * })();
     * ```
     *
     * @param {object} [options] Click options.
     */
    async click(options) {
        if (!this.#started || this.#stopping) {
            throw new Error(errors_1.ERR_NVDA_NOT_RUNNING);
        }
        const command = options?.button === "right"
            ? keyCodeCommands_1.keyCodeCommands.rightMouseClick
            : keyCodeCommands_1.keyCodeCommands.leftMouseClick;
        // R1: one chord at a time; the gate refuses a second chord while one is in flight.
        await this.#client.enqueueAndTap(async () => {
            for (let i = 0; i < (options.clickCount ?? 1); i++) {
                await this.#client.sendKeyCode(command);
            }
        }, options);
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-last-spoken-phrase)
     *
     * Get the last spoken phrase.
     *
     * ```ts
     * import { nvda } from "@guidepup/guidepup";
     *
     * (async () => {
     *   // Start NVDA.
     *   await nvda.start();
     *
     *   // Move to the next item.
     *   await nvda.next();
     *
     *   // Get the phrase spoken by NVDA from moving to the next item above.
     *   const lastSpokenPhrase = await nvda.lastSpokenPhrase();
     *   console.log(lastSpokenPhrase);
     *
     *   // Stop NVDA.
     *   await nvda.stop();
     * })();
     * ```
     *
     * @returns {string} The last spoken phrase.
     */
    async lastSpokenPhrase() {
        if (!this.#started || this.#stopping) {
            throw new Error(errors_1.ERR_NVDA_NOT_RUNNING);
        }
        return (await this.#client.spokenPhraseLog()).at(-1) ?? "";
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-item-text)
     *
     * Get the last spoken phrase.
     *
     * For NVDA this is the same as `lastSpokenPhrase`.
     *
     * ```ts
     * import { nvda } from "@guidepup/guidepup";
     *
     * (async () => {
     *   // Start NVDA.
     *   await nvda.start();
     *
     *   // Move to the next item.
     *   await nvda.next();
     *
     *   // Get the text (if any) for the item currently in focus by the NVDA
     *   // cursor.
     *   const itemText = await nvda.itemText();
     *   console.log(itemText);
     *
     *   // Stop NVDA.
     *   await nvda.stop();
     * })();
     * ```
     *
     * @alias lastSpokenPhrase
     *
     * @returns {Promise<string>} The last spoken phrase.
     */
    async itemText() {
        if (!this.#started || this.#stopping) {
            throw new Error(errors_1.ERR_NVDA_NOT_RUNNING);
        }
        return this.lastSpokenPhrase();
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-spoken-phrase-log)
     *
     * Get the log of all spoken phrases for this NVDA instance.
     *
     * ```ts
     * import { nvda } from "@guidepup/guidepup";
     *
     * (async () => {
     *   // Start NVDA.
     *   await nvda.start();
     *
     *   // Move through several items.
     *   for (let i = 0; i < 10; i++) {
     *     await nvda.next();
     *   }
     *
     *   // Get the phrase spoken by NVDA from moving through the items above.
     *   const spokenPhraseLog = await nvda.spokenPhraseLog();
     *   console.log(spokenPhraseLog);
     *
     *   // Stop NVDA.
     *   await nvda.stop();
     * })();
     * ```
     *
     * @returns {Promise<string[]>} The spoken phrase log.
     */
    async spokenPhraseLog() {
        if (!this.#started || this.#stopping) {
            throw new Error(errors_1.ERR_NVDA_NOT_RUNNING);
        }
        return this.#client.spokenPhraseLog();
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-clear-spoken-phrase-log)
     *
     * Clear the log of all spoken phrases for this NVDA instance.
     *
     * ```ts
     * import { nvda } from "@guidepup/guidepup";
     *
     * (async () => {
     *   // Start NVDA.
     *   await nvda.start();
     *
     *   // ... perform some commands.
     *
     *   // Clear the spoken phrase log.
     *   await nvda.clearSpokenPhraseLog();
     *
     *   // Stop NVDA.
     *   await nvda.stop();
     * })();
     * ```
     */
    async clearSpokenPhraseLog() {
        if (!this.#started || this.#stopping) {
            throw new Error(errors_1.ERR_NVDA_NOT_RUNNING);
        }
        await this.#client.clearSpokenPhraseLog();
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-item-text-log)
     *
     * Get the log of all spoken phrases for this NVDA instance.
     *
     * For NVDA this is the same as `spokenPhraseLog`.
     *
     * ```ts
     * import { nvda } from "@guidepup/guidepup";
     *
     * (async () => {
     *   // Start NVDA.
     *   await nvda.start();
     *
     *   // Move through several items.
     *   for (let i = 0; i < 10; i++) {
     *     await nvda.next();
     *   }
     *
     *   // Get the text (if any) for all the items visited by the NVDA cursor.
     *   const itemTextLog = await nvda.itemTextLog();
     *   console.log(itemTextLog);
     *
     *   // Stop NVDA.
     *   await nvda.stop();
     * })();
     * ```
     *
     * @alias lastSpokenPhrase
     *
     * @returns {Promise<string[]>} The spoken phrase log.
     */
    async itemTextLog() {
        if (!this.#started || this.#stopping) {
            throw new Error(errors_1.ERR_NVDA_NOT_RUNNING);
        }
        return this.spokenPhraseLog();
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-clear-item-text-log)
     *
     * Clear the log of all spoken phrases for this NVDA instance.
     *
     * For NVDA this is the same as `clearSpokenPhraseLog`.
     *
     * ```ts
     * import { nvda } from "@guidepup/guidepup";
     *
     * (async () => {
     *   // Start NVDA.
     *   await nvda.start();
     *
     *   // ... perform some commands.
     *
     *   // Clear the spoken phrase log.
     *   await nvda.clearItemTextLog();
     *
     *   // Stop NVDA.
     *   await nvda.stop();
     * })();
     * ```
     *
     * @alias clearSpokenPhraseLog
     */
    async clearItemTextLog() {
        if (!this.#started || this.#stopping) {
            throw new Error(errors_1.ERR_NVDA_NOT_RUNNING);
        }
        await this.#client.clearSpokenPhraseLog();
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-get-settings)
     *
     * Returns all the current settings for this NVDA instance.
     *
     * ```ts
     * import { nvda } from "@guidepup/guidepup";
     *
     * (async () => {
     *   // Start NVDA.
     *   await nvda.start();
     *
     *   // Log current settings.
     *   console.log(nvda.getSettings());
     *
     *   // Stop NVDA.
     *   await nvda.stop();
     * })();
     * ```
     *
     * @returns {Record<string, unknown>} Current settings values.
     */
    getSettings() {
        return (0, config_1.getConfig)();
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-get-setting)
     *
     * Returns the value of a setting for this NVDA instance.
     *
     * ```ts
     * import { nvda } from "@guidepup/guidepup";
     *
     * (async () => {
     *   // Start NVDA.
     *   await nvda.start();
     *
     *   // Log the value for the 'virtualBuffers.autoSayAllOnPageLoad' setting.
     *   console.log(nvda.getSetting('virtualBuffers.autoSayAllOnPageLoad'));
     *
     *   // Stop NVDA.
     *   await nvda.stop();
     * })();
     * ```
     *
     * @param key The setting name.
     * @returns {unknown} The setting value.
     */
    getSetting(key) {
        return (0, config_1.getConfigKey)(key);
    }
    /**
     * [API Reference](https://www.guidepup.dev/docs/api/class-nvda#nvda-capture)
     *
     * Capture NVDA output produced by an action.
     *
     * The action can be performed using an external automation tool such as
     * Playwright. Guidepup captures the NVDA output associated with
     * the action and returns it together with the action's result.
     *
     * @param {() => Promise<T>} action The action to perform while capturing NVDA output.
     * @param {object} [options] Additional options.
     * @returns {Promise<Capture<T>>} The action's result and captured NVDA output.
     */
    async capture(action, options) {
        if (!this.#started || this.#stopping) {
            throw new Error(errors_1.ERR_NVDA_NOT_RUNNING);
        }
        return await this.#client.enqueueAndTap(async () => action(), options);
    }
}
exports.NVDA = NVDA;
// R1: after load, the key tables, the Key class, the NVDA class and these modules' exports cannot be
// replaced or changed (vendorIntegrity in src/speech/vendortree.mjs checks this before every send).
const deepFreeze = (value) => {
    if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const inner of Object.values(value)) {
            deepFreeze(inner);
        }
    }
    return value;
};
deepFreeze(KeyCodes_1.KeyCodes);
deepFreeze(Modifiers_1.Modifiers);
deepFreeze(keyCodeCommands_1.keyCodeCommands);
Object.freeze(Key_1.Key.prototype);
Object.freeze(Key_1.Key);
Object.freeze(NVDA.prototype);
Object.freeze(NVDA);
for (const mod of [Key_1, KeyCodes_1, Modifiers_1, keyCodeCommands_1, parseKey_1, start_1, quit_1, require("./isRunning"), exports]) {
    Object.freeze(mod);
}
