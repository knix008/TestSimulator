// UI preferences (not server settings): language, theme, font size, layout,
// window bounds. One JSON file next to server_settings.json.
'use strict';

const fs = require('fs');
const path = require('path');
const { defaultConfigDir } = require('./settings');

const DEFAULTS = {
  language: 'ko',
  theme: 'midnight',
  themeBg: '',
  fontSize: 13,
  logHeight: 190,
  lastProfile: '',
  confirmStop: true,          // ask before stopping a server with clients connected
  autoStart: false,           // start the server when the app opens
  minimizeToTray: false,      // (desktop) closing the window hides it instead
  sounds: true,
  windowBounds: null,
};

class Session {
  constructor(configDir) {
    this.configDir = configDir || defaultConfigDir();
    this.file = path.join(this.configDir, 'session.json');
    this.data = { ...DEFAULTS };
  }

  load() {
    try { this.data = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(this.file, 'utf-8')) }; }
    catch { this.data = { ...DEFAULTS }; }
    return this.get();
  }

  get() { return { ...this.data }; }

  save(patch) {
    this.data = { ...this.data, ...(patch || {}) };
    try {
      fs.mkdirSync(this.configDir, { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch { /* best effort */ }
    return this.get();
  }
}

module.exports = { Session, DEFAULTS };
