function saveOptions(e) {
  e.preventDefault();
  var formData = new FormData(document.querySelector("form"));
  var optionData = {};
  for (const entry of formData) {
    optionData[entry[0]] = entry[1];
  }
  browser.storage.local.set(optionData);
}

function restoreOptions() {

  function setCurrentChoice(result) {
    // Fix for FF < 52
    if (result.length > 0) {
      result = result[0];
    }

    // Newtab option
    if (result.newtab === undefined) {
      result.newtab = "media-bg"
    }
    document.querySelector("input[name=newtab][value=" + result.newtab + "]").checked = true;

    // Window option
    if (result.window === undefined) {
      result.window = "fg-follow"
    }
    document.querySelector("input[name=window][value=" + result.window + "]").checked = true;
  }

  function onError(error) {
    console.log(`Error: ${error}`);
  }

  var getting = browser.storage.local.get();
  getting.then(setCurrentChoice, onError);
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("form").addEventListener("submit", saveOptions);

// ----------------- Internationalization ------------------
for (let node of document.querySelectorAll('[data-i18n]')) {
  let [text, attr] = node.dataset.i18n.split('|');
  text = chrome.i18n.getMessage(text);
  attr ? node[attr] = text : node.appendChild(document.createTextNode(text));
}
// ----------------- /Internationalization -----------------