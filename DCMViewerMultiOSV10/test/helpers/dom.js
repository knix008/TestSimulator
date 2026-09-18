/* Loads a browser-style script (window.X = …) into a minimal fake window for Node tests. */
const fs = require('fs');
const path = require('path');

function fakeWindow(extra = {}) {
  const win = {
    document: { documentElement: { style: { setProperty() {} }, lang: '' }, body: { dataset: {} }, querySelectorAll: () => [], createElement: () => ({ style: {}, classList: { add() {}, toggle() {} }, setAttribute() {}, appendChild() {} }) },
    localStorage: { getItem: () => null, setItem() {} },
    navigator: { userAgent: 'node' },
    ...extra,
  };
  win.window = win;
  return win;
}

function loadScript(file, win) {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', file), 'utf8');
  // run with `window`, `document`, `self` bound to the fake window
  new Function('window', 'document', 'self', 'navigator', 'localStorage', src)(win, win.document, win, win.navigator, win.localStorage);
  return win;
}

module.exports = { fakeWindow, loadScript };
