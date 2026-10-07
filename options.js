"use strict";

// Fill in translated text.
for (const node of document.querySelectorAll("[data-i18n]")) {
  node.textContent = browser.i18n.getMessage(node.dataset.i18n);
}

const form = document.querySelector("form");

async function restoreOptions() {
  const options = await loadOptions();
  for (const [name, value] of Object.entries(options)) {
    for (const input of form.elements.namedItem(name)) {
      input.checked = input.value === value;
    }
  }
}

// Save each setting as soon as it changes.
form.addEventListener("change", (event) => {
  const { name, value } = event.target;
  if (name in OPTION_DEFAULTS) {
    browser.storage.local.set({ [name]: value }).catch((error) => {
      console.error(`Cannot save option ${name}: ${error}`);
    });
  }
});

restoreOptions().catch((error) => {
  console.error(`Cannot load options: ${error}`);
});
