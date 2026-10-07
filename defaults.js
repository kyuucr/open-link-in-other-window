"use strict";

// Shared by background.js and options.js.

const OPTION_DEFAULTS = Object.freeze({
    newtab: "media-bg",
    window: "bg",
});

const OPTION_VALUES = Object.freeze({
    newtab: ["fg", "bg", "media-fg", "media-bg", "media-any-fg", "media-any-bg"],
    window: ["fg", "fg-follow", "bg"],
});

// Return stored options with unknown or missing values replaced by defaults.
function normalizeOptions(stored) {
    const options = {};
    for (const key of Object.keys(OPTION_DEFAULTS)) {
        const value = stored ? stored[key] : undefined;
        options[key] = OPTION_VALUES[key].includes(value) ? value : OPTION_DEFAULTS[key];
    }
    return options;
}

async function loadOptions() {
    return normalizeOptions(await browser.storage.local.get(Object.keys(OPTION_DEFAULTS)));
}
