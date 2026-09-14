// Connection history: every successful connection is remembered — profile
// or not — in history.json next to session.json, newest first.
//
//   [{ protocol, host, port, user, lastAt, count }]
//
// No passwords are stored here; picking an entry fills the form and the
// password comes from a profile with the same server, if there is one.
'use strict';

const fs = require('fs');
const path = require('path');

const MAX = 20;

function keyOf(e) {
  return `${e.protocol}|${e.host.toLowerCase()}|${e.port}|${e.user}`;
}

class History {
  constructor(configDir) {
    this.file = path.join(configDir, 'history.json');
    this.items = [];
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf-8'));
      this.items = Array.isArray(raw) ? raw.filter((e) => e && e.host).map((e) => ({
        protocol: String(e.protocol || 'FTP').toUpperCase(),
        host: String(e.host),
        port: Number(e.port) || 0,
        user: String(e.user || ''),
        lastAt: Number(e.lastAt) || 0,
        count: Number(e.count) || 1,
      })) : [];
    } catch {
      this.items = [];
    }
    return this.list();
  }

  list() {
    return this.items.map((e) => ({ ...e }));
  }

  // Records a connection; an existing entry for the same server moves to the top.
  add({ protocol, host, port, user }) {
    const entry = { protocol: String(protocol).toUpperCase(), host: String(host), port: Number(port) || 0, user: String(user || ''), lastAt: Date.now(), count: 1 };
    const k = keyOf(entry);
    const i = this.items.findIndex((e) => keyOf(e) === k);
    if (i >= 0) { entry.count = this.items[i].count + 1; this.items.splice(i, 1); }
    this.items.unshift(entry);
    if (this.items.length > MAX) this.items.length = MAX;
    this._write();
    return this.list();
  }

  remove(entry) {
    const k = keyOf({ protocol: String(entry.protocol || '').toUpperCase(), host: String(entry.host || ''), port: Number(entry.port) || 0, user: String(entry.user || '') });
    const before = this.items.length;
    this.items = this.items.filter((e) => keyOf(e) !== k);
    if (this.items.length !== before) this._write();
    return this.list();
  }

  clear() {
    this.items = [];
    this._write();
    return [];
  }

  _write() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.items, null, 2), 'utf-8');
    } catch { /* best effort */ }
  }
}

module.exports = { History, MAX_HISTORY: MAX };
