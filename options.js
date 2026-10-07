"use strict";

// Fill in translated text.
for (const node of document.querySelectorAll("[data-i18n]")) {
  node.textContent = browser.i18n.getMessage(node.dataset.i18n);
}

const form = document.querySelector("form");
const clickEnabledInput = form.elements.namedItem("clickEnabled");
const COMMAND_ID = "open-focused-link";

function logError(what) {
  return (error) => console.error(`${what}: ${error}`);
}

async function restoreOptions() {
  const options = await loadOptions();
  for (const name of ["newtab", "window", "clickModifier"]) {
    for (const input of form.elements.namedItem(name)) {
      input.checked = input.value === options[name];
    }
  }
  // The user can revoke the permission in about:addons.
  const granted = await browser.permissions.contains({ origins: ALL_URLS });
  clickEnabledInput.checked = options.clickEnabled && granted;
}

function setClickEnabled(enabled) {
  clickEnabledInput.checked = enabled;
  return browser.storage.local.set({ clickEnabled: enabled });
}

// permissions.request() only works directly inside a user action, so call
// it before anything asynchronous.
function onClickEnabledChange() {
  if (clickEnabledInput.checked) {
    browser.permissions.request({ origins: ALL_URLS })
      .then((granted) => setClickEnabled(granted))
      .catch(logError("Cannot request permission"));
  } else {
    setClickEnabled(false)
      .then(() => browser.permissions.remove({ origins: ALL_URLS }))
      .catch(logError("Cannot turn off modifier-click"));
  }
}

// Save each setting as soon as it changes.
form.addEventListener("change", (event) => {
  const { name, value } = event.target;
  if (name === "clickEnabled") {
    onClickEnabledChange();
  } else if (name in OPTION_DEFAULTS) {
    browser.storage.local.set({ [name]: value }).catch(logError(`Cannot save option ${name}`));
  }
});

async function showShortcut() {
  const commands = await browser.commands.getAll();
  const command = commands.find((c) => c.name === COMMAND_ID);
  const shortcut = command && command.shortcut;
  document.getElementById("shortcut").textContent = shortcut
    ? browser.i18n.getMessage("optionShortcutCurrent", shortcut)
    : browser.i18n.getMessage("optionShortcutNone");

  // commands.openShortcutSettings() exists only in newer Firefox versions.
  if (typeof browser.commands.openShortcutSettings === "function") {
    const button = document.getElementById("shortcut-change");
    button.hidden = false;
    button.addEventListener("click", () => {
      browser.commands.openShortcutSettings().catch(logError("Cannot open shortcut settings"));
    });
  }
}

restoreOptions().catch(logError("Cannot load options"));
showShortcut().catch(logError("Cannot show shortcut"));
