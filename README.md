# Open Link in Other Window

This extension adds a context menu for opening links in other window. Great for people
who use multiple monitor setup, running more than one instance of Firefox.

Features:

* Option to open the link in a foreground or background tab, with the consideration
that other window's active tab (or any tab) is playing media.
* Option to bring the new tab window to foreground.
* The first item in the menu opens the link in the last focused other window.
With the keyboard: right-click the link (or press the Menu key), then <kbd>O</kbd>, <kbd>L</kbd>.
Other windows have access keys <kbd>1</kbd> to <kbd>9</kbd>.
* Keyboard shortcut (<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd> by default) opens the
focused link in the last focused other window. Change it in Add-ons Manager, gear icon,
Manage Extension Shortcuts.
* Optional modifier-click (Shift+Alt+click by default, or Ctrl+Alt+click, Alt+click, middle
click) opens the clicked link in the last focused other window. It's off by default
because it needs permission to access all websites; turn it on in the extension options.
* i18n (English, Indonesian, Czech), contribution is greatly appreciated.

Bug reports and suggestions are highly appreciated :smile:

Firefox AMO link: https://addons.mozilla.org/en-US/firefox/addon/open-link-in-other-window/

## Development

```sh
npm install
npm run lint    # web-ext lint
npm start       # run in a temporary Firefox profile
npm run build   # package into web-ext-artifacts/
```
