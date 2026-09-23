'use strict';

const crypto = require('crypto');

const id = () => crypto.randomBytes(8).toString('hex');

/**
 * Apps we try to put on the dock the first time MyDockBar runs, matched
 * loosely against whatever the scanner found on this machine.
 */
const WISHLIST = {
  win32: [
    [/^(google )?chrome$/i, 'Chrome'],
    [/^(microsoft )?edge$/i, 'Edge'],
    [/^firefox$/i, 'Firefox'],
    [/^(windows )?terminal$/i, 'Terminal'],
    [/^visual studio code$/i, 'VS Code'],
    [/^(microsoft )?word$/i, 'Word'],
    [/^(microsoft )?excel$/i, 'Excel'],
    [/^notepad(\+\+)?$/i, 'Notepad'],
    [/^calculator|계산기$/i, 'Calculator'],
  ],
  darwin: [
    [/^safari$/i, 'Safari'],
    [/^(google )?chrome$/i, 'Chrome'],
    [/^mail$/i, 'Mail'],
    [/^terminal$/i, 'Terminal'],
    [/^visual studio code$/i, 'VS Code'],
    [/^notes$/i, 'Notes'],
    [/^calendar$/i, 'Calendar'],
    [/^system settings|system preferences$/i, 'Settings'],
  ],
  linux: [
    [/^firefox/i, 'Firefox'],
    [/^(google )?chrome/i, 'Chrome'],
    [/^(gnome )?terminal|konsole$/i, 'Terminal'],
    [/^(nautilus|files|dolphin|thunar)$/i, 'Files'],
    [/^visual studio code|code$/i, 'VS Code'],
    [/^text editor|gedit|kate$/i, 'Editor'],
    [/^(gnome )?calculator$/i, 'Calculator'],
  ],
};

/**
 * The built-in entries every dock starts with. They are `special`, which is
 * also what marks them undeletable - the dock's own settings button in
 * particular has to stay reachable.
 */
const DEFAULTS = [
  { label: 'Home', path: 'system:home' },
  { label: 'Show Desktop', path: 'system:show-desktop' },
  { label: 'Trash', path: 'system:trash' },
  { label: 'Settings', path: 'dock:settings' },
];

function build(found) {
  const wishlist = WISHLIST[process.platform] || WISHLIST.linux;
  const items = [];
  const used = new Set();

  for (const [pattern, label] of wishlist) {
    const match = found.find((entry) => pattern.test(entry.label.trim()) && !used.has(entry.path));
    if (!match) continue;
    used.add(match.path);
    items.push({
      id: id(),
      type: 'app',
      label,
      path: match.path,
      args: match.args || '',
      icon: match.icon || '',
    });
    if (items.length >= 7) break;
  }

  items.push({ id: id(), type: 'separator', label: '', path: '', args: '', icon: '' });
  for (const entry of DEFAULTS) items.push({ id: id(), type: 'special', args: '', icon: '', ...entry });

  return items;
}

/**
 * Add any of the dock's own buttons that a previously saved config predates.
 * Without this, an existing user would never get the settings button that is
 * now the supported way back into preferences.
 */
function ensureDefaults(config) {
  const items = config.get().items.slice();
  const present = new Set(items.map((item) => item.path));
  const missing = DEFAULTS.filter((entry) => !present.has(entry.path));
  if (!missing.length) return false;

  for (const entry of missing) {
    items.push({ id: id(), type: 'special', args: '', icon: '', ...entry });
  }
  config.setItems(items);
  return true;
}

module.exports = { build, ensureDefaults, WISHLIST, DEFAULTS };
