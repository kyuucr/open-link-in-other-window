"use strict";

// Registered only when the user turns on modifier-click in the options and
// grants access to all websites.

// Injection can race with registration during a navigation. Install once.
(() => {
if (globalThis.otherWindowClickInstalled) {
    return;
}
globalThis.otherWindowClickInstalled = true;
let clickModifier = "shift-alt";
let clickEnabled = false;

browser.storage.local.get(["clickEnabled", "clickModifier"]).then((options) => {
    clickEnabled = options.clickEnabled === true;
    clickModifier = options.clickModifier || "shift-alt";
}).catch((error) => {
    console.error(`Cannot load modifier-click settings: ${error}`);
});

browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") {
        return;
    }
    if (changes.clickModifier) {
        clickModifier = changes.clickModifier.newValue || "shift-alt";
    }
    if (changes.clickEnabled) {
        clickEnabled = changes.clickEnabled.newValue === true;
    }
});

function matchesModifier(event) {
    const { shiftKey, altKey, ctrlKey, metaKey } = event;
    switch (clickModifier) {
        case "middle":
            return event.button === 1 && !shiftKey && !altKey && !ctrlKey && !metaKey;
        case "alt":
            return event.button === 0 && !shiftKey && altKey && !ctrlKey && !metaKey;
        case "ctrl-alt":
            return event.button === 0 && !shiftKey && altKey && ctrlKey && !metaKey;
        case "shift-alt":
        default:
            return event.button === 0 && shiftKey && altKey && !ctrlKey && !metaKey;
    }
}

function onClick(event) {
    if (!clickEnabled || !event.isTrusted || !matchesModifier(event)) {
        return;
    }
    const url = linkFromPath(event.composedPath());
    if (!url) {
        return;
    }
    // Stop Firefox (open in new tab, save link) and the page from handling it.
    event.preventDefault();
    event.stopImmediatePropagation();
    browser.runtime.sendMessage({ type: "open-link", url }).catch((error) => {
        console.error(`Open Link in Other Window: ${error}`);
    });
}

// Capture phase on window, so the page can't stop the event first.
window.addEventListener("click", onClick, true);
window.addEventListener("auxclick", onClick, true);
})();
