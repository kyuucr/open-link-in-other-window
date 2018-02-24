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