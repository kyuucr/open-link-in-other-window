"use strict";

// Find the URL of a link. Used by the content script and by the keyboard
// shortcut, which injects this file into the active tab.

function linkUrl(element) {
    if ((element instanceof HTMLAnchorElement || element instanceof HTMLAreaElement)
            && element.href) {
        return element.href;
    }
    if (element instanceof SVGAElement && element.href.baseVal) {
        return new URL(element.href.baseVal, element.baseURI).href;
    }
    return null;
}

// First link in an event path (event.composedPath()), which includes
// elements inside shadow roots.
function linkFromPath(path) {
    for (const node of path) {
        if (node instanceof Element) {
            const url = linkUrl(node);
            if (url) {
                return url;
            }
        }
    }
    return null;
}

// Link that has keyboard focus, looking inside open shadow roots.
// Focus inside a cross-origin frame is not visible from here.
function focusedLinkUrl() {
    let element = document.activeElement;
    while (element && element.shadowRoot && element.shadowRoot.activeElement) {
        element = element.shadowRoot.activeElement;
    }
    while (element) {
        const url = linkUrl(element);
        if (url) {
            return url;
        }
        const root = element.getRootNode();
        element = element.parentElement || (root instanceof ShadowRoot ? root.host : null);
    }
    return null;
}
