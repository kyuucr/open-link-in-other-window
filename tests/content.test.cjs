const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");

const script = readFileSync(require.resolve("../content.js"), "utf8");

async function setup(options) {
    const listeners = {};
    const messages = [];
    let onChanged;
    let installed = 0;
    const context = vm.createContext({
        console,
        linkFromPath: (path) => path[0],
        window: {
            addEventListener: (type, listener) => {
                installed++;
                listeners[type] = listener;
            },
        },
        browser: {
            storage: {
                local: { get: async () => options },
                onChanged: { addListener: (listener) => { onChanged = listener; } },
            },
            runtime: {
                sendMessage: async (message) => { messages.push(message); },
            },
        },
    });
    vm.runInContext(script, context);
    await Promise.resolve();
    function click(overrides = {}) {
        const event = {
            isTrusted: true, button: 0,
            ctrlKey: true, altKey: true, shiftKey: false, metaKey: false,
            composedPath: () => ["https://example.com/link"],
            preventDefault() { this.prevented = true; },
            stopImmediatePropagation() { this.stopped = true; },
            ...overrides,
        };
        listeners[event.button === 1 ? "auxclick" : "click"](event);
        return event;
    }
    return { context, click, messages, change: (...args) => onChanged(...args), installed: () => installed };
}

test("Ctrl+Alt+click sends the link once and suppresses ordinary navigation", async () => {
    const page = await setup({ clickEnabled: true, clickModifier: "ctrl-alt" });
    const event = page.click();
    assert.equal(page.messages.length, 1);
    assert.equal(page.messages[0].url, "https://example.com/link");
    assert.equal(event.prevented, true);
    assert.equal(event.stopped, true);
    page.click({ ctrlKey: false, altKey: false });
    assert.equal(page.messages.length, 1);
});

test("disabling works on an already injected page, and re-enabling uses the new modifier", async () => {
    const page = await setup({ clickEnabled: true, clickModifier: "ctrl-alt" });
    page.change({ clickEnabled: { newValue: false } }, "local");
    assert.equal(page.click().prevented, undefined);
    assert.equal(page.messages.length, 0);
    page.change({
        clickEnabled: { newValue: true },
        clickModifier: { newValue: "middle" },
    }, "local");
    page.click({ button: 1, ctrlKey: false, altKey: false });
    assert.equal(page.messages.length, 1);
});

test("injecting twice does not add duplicate click handlers", async () => {
    const page = await setup({ clickEnabled: true, clickModifier: "ctrl-alt" });
    vm.runInContext(script, page.context);
    assert.equal(page.installed(), 2);
    page.click();
    assert.equal(page.messages.length, 1);
});
