"use strict";

const ROOT_ID = "open-link-in-other-window";
const NULL_ID = "null-window";
const LAST_PREFIX = "last-window-";
const WINDOW_PREFIX = "window-";
const SEPARATOR_ID = "separator";
const COMMAND_ID = "open-focused-link";
const CONTENT_SCRIPT_ID = "modifier-click";
const DEFAULT_COOKIE_STORES = ["firefox-default", "firefox-private"];
const FOCUS_HISTORY_KEY = "focusHistory";
const FOCUS_HISTORY_LIMIT = 50;

// Increases every time a context menu opens, so a slow onShown handler
// can tell that the menu it was building is already gone.
let menuInstance = 0;

// ----------------------------------------------------------------------
// Window focus history
//
// Most recently focused window first. Kept in storage.session so it
// survives the background page being unloaded, but not a browser restart.

let focusQueue = Promise.resolve();

function updateFocusHistory(update) {
    focusQueue = focusQueue.then(async () => {
        const stored = await browser.storage.session.get(FOCUS_HISTORY_KEY);
        const history = update(stored[FOCUS_HISTORY_KEY] || []);
        await browser.storage.session.set({ [FOCUS_HISTORY_KEY]: history.slice(0, FOCUS_HISTORY_LIMIT) });
    }).catch((error) => {
        console.error(`Cannot update window focus history: ${error}`);
    });
    return focusQueue;
}

function recordFocus(windowId) {
    if (windowId === browser.windows.WINDOW_ID_NONE) {
        return;
    }
    updateFocusHistory((history) => [windowId, ...history.filter((id) => id !== windowId)]);
}

browser.windows.onFocusChanged.addListener(recordFocus);

browser.windows.onRemoved.addListener((windowId) => {
    updateFocusHistory((history) => history.filter((id) => id !== windowId));
});

async function seedFocusHistory() {
    try {
        const focused = await browser.windows.getLastFocused();
        recordFocus(focused.id);
    } catch (error) {
        // No window open yet.
    }
}

// Normal windows other than currentWindowId, most recently focused first.
// Windows missing from the history keep their getAll() order at the end.
async function otherWindows(currentWindowId) {
    await focusQueue;
    const [windows, stored] = await Promise.all([
        browser.windows.getAll({ populate: true, windowTypes: ["normal"] }),
        browser.storage.session.get(FOCUS_HISTORY_KEY),
    ]);
    const history = stored[FOCUS_HISTORY_KEY] || [];
    const rank = (w) => {
        const index = history.indexOf(w.id);
        return index === -1 ? history.length : index;
    };
    return windows
        .filter((w) => w.id !== currentWindowId)
        .sort((a, b) => rank(a) - rank(b));
}

// ----------------------------------------------------------------------
// Context menu

function createRootMenu() {
    browser.menus.create({
        id: ROOT_ID,
        title: browser.i18n.getMessage("contextItemTitleRoot"),
        contexts: ["link"],
    });
}

function windowTitle(win) {
    const activeTab = win.tabs && win.tabs.find((t) => t.active);
    return (activeTab && activeTab.title) || win.title || String(win.id);
}

// "&" marks the access key in menu titles; "&&" is a literal "&".
function escapeAccessKey(text) {
    return text.replace(/&/g, "&&");
}

// Extra menu item properties for private windows.
function windowIcons(win) {
    return win.incognito ? { icons: { "16": "icons/private-browsing.svg" } } : {};
}

// Menus survive the background page being unloaded, so recreate them only
// when the extension is installed or the browser starts.
async function resetMenus() {
    await browser.menus.removeAll();
    createRootMenu();
}

// Build the list of other windows each time the menu opens, instead of
// tracking window and tab events.
browser.menus.onShown.addListener(async (info, tab) => {
    if (!info.contexts.includes("link")) {
        return;
    }
    const instance = ++menuInstance;
    const others = await otherWindows(tab ? tab.windowId : undefined);
    if (instance !== menuInstance) {
        return;
    }

    await browser.menus.removeAll();
    createRootMenu();

    if (others.length === 0) {
        browser.menus.create({
            id: NULL_ID,
            title: browser.i18n.getMessage("contextItemTitleNull"),
            contexts: ["link"],
            parentId: ROOT_ID,
            enabled: false,
        });
        browser.menus.refresh();
        return;
    }

    // The last focused other window first, so right-click, O, L opens it.
    const last = others[0];
    browser.menus.create({
        id: LAST_PREFIX + last.id,
        title: browser.i18n.getMessage("contextItemTitleLast", escapeAccessKey(windowTitle(last))),
        contexts: ["link"],
        parentId: ROOT_ID,
        ...windowIcons(last),
    });
    browser.menus.create({
        id: SEPARATOR_ID,
        type: "separator",
        contexts: ["link"],
        parentId: ROOT_ID,
    });

    others.forEach((w, index) => {
        // Access keys 1-9 for the first nine windows.
        const prefix = index < 9 ? `&${index + 1} ` : "";
        browser.menus.create({
            id: WINDOW_PREFIX + w.id,
            title: prefix + escapeAccessKey(windowTitle(w)),
            contexts: ["link"],
            parentId: ROOT_ID,
            ...windowIcons(w),
        });
    });
    browser.menus.refresh();
});

browser.menus.onHidden.addListener(() => {
    menuInstance++;
});

function windowIdFromMenuItem(menuItemId) {
    for (const prefix of [LAST_PREFIX, WINDOW_PREFIX]) {
        if (menuItemId.startsWith(prefix)) {
            const id = parseInt(menuItemId.slice(prefix.length), 10);
            return Number.isNaN(id) ? null : id;
        }
    }
    return null;
}

browser.menus.onClicked.addListener((info, tab) => {
    const windowId = windowIdFromMenuItem(String(info.menuItemId));
    if (windowId === null || !info.linkUrl) {
        return;
    }
    openInWindow(info.linkUrl, windowId, tab).catch((error) => {
        console.error(`Cannot open ${info.linkUrl} in window ${windowId}: ${error}`);
    });
});

// ----------------------------------------------------------------------
// Opening links

// Decide whether the new tab becomes the active tab in the target window.
// isAudible is only used by the media-* settings.
function shouldActivate(newtab, isAudible) {
    switch (newtab) {
        case "fg":
            return true;
        case "bg":
            return false;
        default:
            // media-fg / media-any-fg: foreground when media plays.
            // media-bg / media-any-bg: background when media plays.
            return newtab.endsWith("-fg") ? isAudible : !isAudible;
    }
}

async function isTargetAudible(windowId, newtab) {
    const query = { windowId, audible: true };
    if (!newtab.startsWith("media-any-")) {
        query.active = true;
    }
    const tabs = await browser.tabs.query(query);
    return tabs.length > 0;
}

// Firefox refuses privileged URLs (about:, file:, javascript:, data:, ...),
// so callers must handle a rejected promise.
async function openInWindow(url, windowId, sourceTab) {
    const options = await loadOptions();
    const isAudible = options.newtab.startsWith("media-")
        ? await isTargetAudible(windowId, options.newtab)
        : false;
    const active = shouldActivate(options.newtab, isAudible);

    const createProps = { url, windowId, active };
    const target = await browser.windows.get(windowId);
    // Keep the source tab's container. Containers don't exist in private
    // windows, so only pass it when both windows are the same kind.
    if (sourceTab && sourceTab.cookieStoreId
            && !DEFAULT_COOKIE_STORES.includes(sourceTab.cookieStoreId)
            && sourceTab.incognito === target.incognito) {
        createProps.cookieStoreId = sourceTab.cookieStoreId;
    }

    await browser.tabs.create(createProps);
    if (options.window === "fg" || (options.window === "fg-follow" && active)) {
        await browser.windows.update(windowId, { focused: true });
    }
}

// Open in the most recently focused window other than the source tab's.
// Does nothing when there is no other window.
async function openInLastWindow(url, sourceTab) {
    const others = await otherWindows(sourceTab.windowId);
    if (others.length === 0) {
        return;
    }
    await openInWindow(url, others[0].id, sourceTab);
}

// ----------------------------------------------------------------------
// Keyboard shortcut: open the focused link

async function activeTab() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tab;
}

browser.commands.onCommand.addListener(async (command, commandTab) => {
    if (command !== COMMAND_ID) {
        return;
    }
    try {
        const tab = commandTab || await activeTab();
        if (!tab) {
            return;
        }
        // activeTab grants access to the tab for this shortcut press.
        await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ["link.js"] });
        const [result] = await browser.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => focusedLinkUrl(),
        });
        if (result && result.result) {
            await openInLastWindow(result.result, tab);
        }
    } catch (error) {
        // Fails on pages extensions can't access, such as about: pages.
        console.error(`Cannot open focused link: ${error}`);
    }
});

// ----------------------------------------------------------------------
// Modifier-click content script

browser.runtime.onMessage.addListener((message, sender) => {
    if (sender.id !== browser.runtime.id || !sender.tab
            || !message || message.type !== "open-link" || typeof message.url !== "string") {
        return undefined;
    }
    return openInLastWindow(message.url, sender.tab).catch((error) => {
        console.error(`Cannot open ${message.url}: ${error}`);
    });
});

let contentScriptQueue = Promise.resolve();

// Register the content script only while the option is on and the user
// has granted access to all websites.
function syncContentScript() {
    contentScriptQueue = contentScriptQueue.then(async () => {
        const { clickEnabled } = await loadOptions();
        const granted = await browser.permissions.contains({ origins: ALL_URLS });
        const registered = await browser.scripting.getRegisteredContentScripts({ ids: [CONTENT_SCRIPT_ID] });
        const wanted = clickEnabled && granted;
        if (wanted && registered.length === 0) {
            await browser.scripting.registerContentScripts([{
                id: CONTENT_SCRIPT_ID,
                js: ["defaults.js", "link.js", "content.js"],
                matches: ALL_URLS,
                allFrames: true,
                runAt: "document_start",
                persistAcrossSessions: false,
            }]);
        } else if (!wanted && registered.length > 0) {
            await browser.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
        }
    }).catch((error) => {
        console.error(`Cannot update the modifier-click content script: ${error}`);
    });
    return contentScriptQueue;
}

browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.clickEnabled) {
        syncContentScript();
    }
});
browser.permissions.onAdded.addListener(syncContentScript);
browser.permissions.onRemoved.addListener(syncContentScript);

// ----------------------------------------------------------------------
// Startup

function onStart() {
    resetMenus();
    seedFocusHistory();
    syncContentScript();
}

browser.runtime.onInstalled.addListener(onStart);
browser.runtime.onStartup.addListener(onStart);
