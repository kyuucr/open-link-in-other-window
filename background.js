browser.contextMenus.create({
    id: "open-link-in-other-window",
    title: "Open Link in Other Window",
    // title: browser.i18n.getMessage("contextItemTitle"),
    contexts: ["link"],
});

var windowList = {};
var lastFocused = -1;
var nullWindowItem = {
    id: "null-window",
    title: "No Other Opened Window",
    // title: browser.i18n.getMessage("nullItemTitle"),
    contexts: ["link"],
    parentId: "open-link-in-other-window",
    enabled: false,
};

function generateItem(id, title) {
    return {
        id: "window-" + id,
        title: title,
        contexts: ["link"],
        parentId: "open-link-in-other-window"
    }
}

browser.windows.getAll().then((windows) => {
    for (let w of windows) {
        windowList[ "window-" + w.id ] = { id: w.id, title: w.title.replace(/ - Mozilla Firefox$/, ""), focused: w.focused };
    }
    console.log(windowList);
    if (Object.keys(windowList).length === 1) {
        browser.contextMenus.create(nullWindowItem);
    } else {
        browser.windows.getLastFocused().then((last) => {
            lastFocused = last.id
            for (let id in windowList) {
                if (id !== "window-" + last.id) {
                    browser.contextMenus.create(generateItem(windowList[id].id, windowList[id].title));
                    console.log("Created menu for window: " + windowList[id].id);
                }
            }
        });
    }
});

browser.windows.onCreated.addListener((newWindow) => {
    console.log("New window: " + newWindow.id);
    if (Object.keys(windowList).length === 1) {
        browser.contextMenus.remove(nullWindowItem.id);
    }
    windowList[ "window-" + newWindow.id ] = { id: newWindow.id, title: newWindow.title.replace(/ - Mozilla Firefox$/, ""), focused: newWindow.focused };
    browser.contextMenus.create(generateItem(newWindow.id, newWindow.title));
    console.log("Created menu for window: " + newWindow.id);
});

browser.windows.onRemoved.addListener((closedWindowId) => {
    console.log("Removed window: " + closedWindowId);
    browser.contextMenus.remove("window-" + closedWindowId);
    delete windowList[ "window-" + closedWindowId ];
    console.log("Removed menu for window: " + closedWindowId);
    if (Object.keys(windowList).length === 1) {
        browser.contextMenus.create(nullWindowItem);
        console.log("Created null menu");
    }
});

browser.windows.onFocusChanged.addListener((focusedWindowId) => {
    if (focusedWindowId !== -1 && focusedWindowId !== lastFocused) {
        browser.contextMenus.remove("window-" + focusedWindowId);
        windowList[ "window-" + focusedWindowId ].focused = true;
        console.log("Change focus to window: " + focusedWindowId + ", menu removed");
        if (lastFocused !== -1 && windowList[ "window-" + lastFocused ]) {
            browser.contextMenus.create(generateItem(lastFocused, windowList[ "window-" + lastFocused ].title));
            windowList[ "window-" + lastFocused ].focused = false;
            console.log("Create menu for lastFocused window: " + lastFocused);
        }
        lastFocused = focusedWindowId;
    }
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.active && tab.status === 'complete') {
        windowList[ "window-" + tab.windowId ].title = tab.title;
        if (!windowList[ "window-" + tab.windowId ].focused) {
            browser.contextMenus.update("window-" + tab.windowId, { title: tab.title });
        }
    }
});

browser.tabs.onActivated.addListener((info) => {
    browser.tabs.get(info.tabId).then((tab) => {
        if (tab.status === 'complete') {
            windowList[ "window-" + tab.windowId ].title = tab.title;
            if (!windowList[ "window-" + tab.windowId ].focused) {
                browser.contextMenus.update("window-" + tab.windowId, { title: tab.title });
            }
        }
    });
});

browser.contextMenus.onClicked.addListener((info, tab) => {
    console.log("Open " + info.linkUrl + " at " + info.menuItemId);
    browser.tabs.create({ url: info.linkUrl, windowId: parseInt(info.menuItemId.split('-')[1]) });
});
