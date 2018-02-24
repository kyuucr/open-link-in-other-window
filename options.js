function saveOptions(e) {
  e.preventDefault();
  browser.storage.local.set({
    newtab: document.querySelector("#newtab").value
  });
}

function restoreOptions() {

  function setCurrentChoice(result) {
    document.querySelector("#newtab").value = result.newtab || "media-bg";
  }

  function onError(error) {
    console.log(`Error: ${error}`);
  }

  var getting = browser.storage.local.get("newtab");
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