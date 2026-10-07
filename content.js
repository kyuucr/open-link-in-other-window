"use strict";

// Registered only when the user turns on modifier-click in the options and
// grants access to all websites.

let clickModifier = OPTION_DEFAULTS.clickModifier;

loadOptions().then((options) => {
    clickModifier = options.clickModifier;
});

browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.clickModifier) {
        clickModifier = normalizeOptions({ clickModifier: changes.clickModifier.newValue }).clickModifier;
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
    if (!event.isTrusted || !matchesModifier(event)) {
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
