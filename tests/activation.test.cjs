const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");

async function activation({ enabled = true, granted = true, registered = true, failure } = {}) {
    let onMessage;
    let injections = 0;
    const event = () => ({ addListener() {} });
    const context = vm.createContext({
        console,
        ALL_URLS: ["<all_urls>"],
        loadOptions: async () => ({ clickEnabled: enabled }),
        browser: {
            runtime: {
                id: "test-extension",
                onMessage: { addListener(listener) { onMessage = listener; } },
                onInstalled: event(), onStartup: event(),
            },
            windows: { onFocusChanged: event(), onRemoved: event() },
            menus: { onShown: event(), onHidden: event(), onClicked: event() },
            commands: { onCommand: event() },
            storage: { onChanged: event() },
            permissions: {
                contains: async () => granted,
                onAdded: event(), onRemoved: event(),
            },
            tabs: { query: async () => [{ id: 1, url: "https://example.com/" }] },
            scripting: {
                getRegisteredContentScripts: async () => registered ? [{}] : [],
                registerContentScripts: async () => {},
                unregisterContentScripts: async () => {},
                executeScript: async () => {
                    injections++;
                    return failure ? [{ error: failure }] : [{ result: null }];
                },
            },
        },
    });
    vm.runInContext(readFileSync(require.resolve("../background.js"), "utf8"), context);
    const status = await onMessage({ type: "modifier-click-status" }, { id: "test-extension" });
    return { status, injections };
}

test("status request attaches existing tabs even when registration already exists", async () => {
    const { status, injections } = await activation();
    assert.equal(injections, 1);
    assert.equal(status.state, "active");
    assert.equal(status.injected, 1);
});

test("script execution errors are included in activation status", async () => {
    const { status } = await activation({ failure: "ReferenceError: test failure" });
    assert.equal(status.injected, 0);
    assert.equal(status.failed, 1);
    assert.match(status.lastError, /ReferenceError/);
});

test("disabled or ungranted modifier-click never injects scripts", async () => {
    const disabled = await activation({ enabled: false });
    assert.equal(disabled.status.state, "disabled");
    assert.equal(disabled.injections, 0);
    const ungranted = await activation({ granted: false });
    assert.equal(ungranted.status.state, "permission");
    assert.equal(ungranted.injections, 0);
});
