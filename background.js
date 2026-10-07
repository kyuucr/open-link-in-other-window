"use strict";

const ROOT_ID = "open-link-in-other-window";
const NULL_ID = "null-window";
const WINDOW_PREFIX = "window-";
const DEFAULT_COOKIE_STORES = ["firefox-default", "firefox-private"];

// Increases every time a context menu opens, so a slow onShown handler
// can tell that the menu it was building is already gone.
let menuInstance = 0;

function createRootMenu() {
    browser.menus.create({
        id: ROOT_ID,
        title: browser.i18n.getMessage("contextItemTitleRoot"),
        contexts: ["link"],
    });
}

// Menus survive the background page being unloaded, so recreate them only
// when the extension is installed or the browser starts.
async function resetMenus() {
    await browser.menus.removeAll();
    createRootMenu();
}

browser.runtime.onInstalled.addListener(resetMenus);
browser.runtime.onStartup.addListener(resetMenus);

function windowTitle(win) {
    const activeTab = win.tabs && win.tabs.find((t) => t.active);
    return (activeTab && activeTab.title) || win.title || String(win.id);
}

// Build the list of other windows each time the menu opens, instead of
// tracking window and tab events.
browser.menus.onShown.addListener(async (info, tab) => {
    if (!info.contexts.includes("link")) {
        return;
    }
    const instance = ++menuInstance;
    const windows = await browser.windows.getAll({ populate: true, windowTypes: ["normal"] });
    if (instance !== menuInstance) {
        return;
    }

    await browser.menus.removeAll();
    createRootMenu();

    const others = windows.filter((w) => !tab || w.id !== tab.windowId);
    if (others.length === 0) {
        browser.menus.create({
            id: NULL_ID,
            title: browser.i18n.getMessage("contextItemTitleNull"),
            contexts: ["link"],
            parentId: ROOT_ID,
            enabled: false,
        });
    }
    for (const w of others) {
        const item = {
            id: WINDOW_PREFIX + w.id,
            title: windowTitle(w),
            contexts: ["link"],
            parentId: ROOT_ID,
        };
        if (w.incognito) {
            item.icons = { "16": "icons/private-browsing.svg" };
        }
        browser.menus.create(item);
    }
    browser.menus.refresh();
});

browser.menus.onHidden.addListener(() => {
    menuInstance++;
});

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

browser.menus.onClicked.addListener((info, tab) => {
    const menuItemId = String(info.menuItemId);
    if (!menuItemId.startsWith(WINDOW_PREFIX) || !info.linkUrl) {
        return;
    }
    const windowId = parseInt(menuItemId.slice(WINDOW_PREFIX.length), 10);
    if (Number.isNaN(windowId)) {
        return;
    }
    // Firefox refuses privileged URLs (about:, file:, javascript:, data:, ...).
    openInWindow(info.linkUrl, windowId, tab).catch((error) => {
        console.error(`Cannot open ${info.linkUrl} in window ${windowId}: ${error}`);
    });
});
