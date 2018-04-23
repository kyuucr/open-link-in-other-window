// Create root context menu item
browser.contextMenus.create({
    id: "open-link-in-other-window",
    title: browser.i18n.getMessage("contextItemTitleRoot"),
    contexts: ["link"],
});

var windowList = {};    // Windows list, { window-id : { id, title, focused } }
var lastFocused = -1;   // Last focused window
var nullWindowItem = {  // Context menu item when no other window
    id: "null-window",
    title: browser.i18n.getMessage("contextItemTitleNull"),
    contexts: ["link"],
    parentId: "open-link-in-other-window",
    enabled: false,
};

// Generate context menu item from a window
function generateItem(id, title, isIncognito) {
    let item = {
        id: "window-" + id,
        title: title,
        contexts: ["link"],
        parentId: "open-link-in-other-window"
    };
    if (isIncognito) {
        item.icons = {
            "16": "chrome://browser/skin/privatebrowsing/private-browsing.svg"
        };
    }
    return item;
}

// Initialization
browser.windows.getAll().then((windows) => {
    // Store all windows info
    for (let w of windows) {
        windowList[ "window-" + w.id ] = {
            id: w.id,
            title: w.title.replace(/ - Mozilla Firefox$/, ""),
            focused: w.focused,
            incognito: w.incognito
        };
    }
    console.log(windowList);
    if (Object.keys(windowList).length === 1) {
        // Only 1 window
        browser.contextMenus.create(nullWindowItem);
    } else {
        // Add all window except topmost/last focused
        browser.windows.getLastFocused().then((last) => {
            lastFocused = last.id
            for (let id in windowList) {
                if (id !== "window-" + last.id) {
                    browser.contextMenus.create(generateItem(windowList[id].id,
                        windowList[id].title,
                        windowList[id].incognito));
                    console.log("Created menu for window: " + windowList[id].id);
                }
            }
        });
    }
});

// Listener for new window event
browser.windows.onCreated.addListener((newWindow) => {
    console.log("New window: " + newWindow.id);
    if (Object.keys(windowList).length === 1) {
        browser.contextMenus.remove(nullWindowItem.id);
    }
    windowList[ "window-" + newWindow.id ] = {
        id: newWindow.id,
        title: newWindow.title.replace(/ - Mozilla Firefox$/, ""),
        focused: newWindow.focused,
        incognito: newWindow.incognito
    };
    browser.contextMenus.create(generateItem(newWindow.id,
        newWindow.title,
        newWindow.incognito));
    console.log("Created menu for window: " + newWindow.id);
});

// Listener for window closed event
browser.windows.onRemoved.addListener((closedWindowId) => {
    browser.contextMenus.remove("window-" + closedWindowId);
    console.log("Removed window: " + closedWindowId);
    delete windowList[ "window-" + closedWindowId ];
    console.log("Removed menu for window: " + closedWindowId);
    if (Object.keys(windowList).length === 1) {
        browser.contextMenus.create(nullWindowItem);
        console.log("Created null menu");
    }
});

// Listener for window focus change event
browser.windows.onFocusChanged.addListener((focusedWindowId) => {
    // Check if new focused window is exist (-1 if no focused window) and not the last focused
    if (focusedWindowId !== -1 && focusedWindowId !== lastFocused) {
        browser.contextMenus.remove("window-" + focusedWindowId);
        windowList[ "window-" + focusedWindowId ].focused = true;
        console.log("Change focus to window: " + focusedWindowId + ", menu removed");
        // Check if lastFocused window exist
        if (lastFocused !== -1 && windowList[ "window-" + lastFocused ]) {
            browser.contextMenus.create(generateItem(lastFocused,
                windowList[ "window-" + lastFocused ].title,
                windowList[ "window-" + lastFocused ].incognito));
            windowList[ "window-" + lastFocused ].focused = false;
            console.log("Create menu for lastFocused window: " + lastFocused);
        }
        lastFocused = focusedWindowId;
    }
});

// Update context menu title when tab status is changed
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.active && tab.status === 'complete') {
        windowList[ "window-" + tab.windowId ].title = tab.title;
        if (!windowList[ "window-" + tab.windowId ].focused) {
            browser.contextMenus.update("window-" + tab.windowId, { title: tab.title });
        }
    }
});

// Update context menu title when another tab activated
browser.tabs.onActivated.addListener((info) => {
    browser.tabs.get(info.tabId).then((tab) => {
        if (tab.status === 'complete') {
            // Store changed title
            windowList[ "window-" + tab.windowId ].title = tab.title;
            // Update title if item is in the context menu
            if (!windowList[ "window-" + tab.windowId ].focused) {
                browser.contextMenus.update("window-" + tab.windowId, { title: tab.title });
            }
        }
    });
});

// On context menu item clicked
browser.contextMenus.onClicked.addListener((info, tab) => {
    var logString = "Open " + info.linkUrl + " at " + info.menuItemId;
    var windowId = parseInt(info.menuItemId.split('-')[1]);
    browser.storage.local.get(["newtab", "window"]).then(function(item) {
        var active = true;
        var newtab = item.newtab || "media-bg";     // Defaults on media-bg
        var newWindow = item.window || "bg";        // Defaults on bg
        switch(newtab) {
            default:        // In case default = "fg", even though it should never happen
            case "fg":
            case "bg":
                active = (newtab !== "bg");
                console.log(logString + " in " + (active ? "fore" : "back") + "ground");
                browser.tabs.create({ url: info.linkUrl, windowId: windowId, active: active });
                if (newWindow === "fg" || (newWindow === "fg-follow" && active)) {
                    browser.windows.update(windowId, { focused: true });
                }
                break;
            case "media-fg":
            case "media-bg":
            case "media-any-fg":
            case "media-any-bg":
                var query = { windowId: windowId, audible: true };
                if (!newtab.includes("any")) {
                    query.active = true;
                }
                browser.tabs.query(query).then(function(tabs) {
                    // It's an XNOR operation
                    var isAudible = tabs.length > 0;
                    active = !((newtab.includes("fg")) ^ isAudible)
                    console.log(logString + " in " + (active ? "fore" : "back") + "ground"
                        + (isAudible ? " because active tab displays media" : ""));
                    browser.tabs.create({ url: info.linkUrl, windowId: windowId, active: active });
                    if (newWindow === "fg" || (newWindow === "fg-follow" && active)) {
                        browser.windows.update(windowId, { focused: true });
                    }
                });
                break;
        }
    },
    function(error) {
        console.log(`Getting local setting error: ${error}`);
    });
});
