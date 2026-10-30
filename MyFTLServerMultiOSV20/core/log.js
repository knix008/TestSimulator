// Server log: an in-memory ring buffer the UI reads (by sequence number, so
// the web version can poll "everything after N") plus an append-only file
// (<configDir>/ftpserver.log) written from a queue, like the original's
// LogManager. Messages come from ./messages.js in the current UI language.
'use strict';

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { render } = require('./messages');

const MAX_LINES = 3000;

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

class Log extends EventEmitter {
  constructor(file) {
    super();
    this.file = file || null;
    this.lines = [];
    this.seq = 0;
    this.language = 'ko';
    this.queue = [];
    this.flushing = false;
  }

  setLanguage(lang) { this.language = lang === 'en' ? 'en' : 'ko'; }

  // add(key, params, level) — key from messages.js; a raw string works too.
  add(key, params = {}, level = 'info') {
    const text = render(this.language, key, params);
    const line = { seq: ++this.seq, time: Date.now(), level, text, key, params };
    this.lines.push(line);
    if (this.lines.length > MAX_LINES) this.lines.splice(0, this.lines.length - MAX_LINES);
    this.emit('line', line);
    if (this.file) this.enqueue(`[${stamp(new Date(line.time))}] ${level === 'error' ? 'ERROR ' : ''}${text}`);
    return line;
  }

  info(key, params) { return this.add(key, params, 'info'); }
  ok(key, params) { return this.add(key, params, 'ok'); }
  warn(key, params) { return this.add(key, params, 'warn'); }
  error(key, params) { return this.add(key, params, 'error'); }
  // Protocol chatter (commands / replies) — shown dimmed, kept out of the file
  // unless `verbose`.
  trace(text) {
    const line = { seq: ++this.seq, time: Date.now(), level: 'trace', text };
    this.lines.push(line);
    if (this.lines.length > MAX_LINES) this.lines.splice(0, this.lines.length - MAX_LINES);
    this.emit('line', line);
    if (this.file && this.verbose) this.enqueue(`[${stamp(new Date(line.time))}] ${text}`);
    return line;
  }

  after(seq) { return this.lines.filter((l) => l.seq > (seq || 0)); }
  clear() { this.lines = []; }

  enqueue(text) {
    this.queue.push(text);
    if (this.flushing) return;
    this.flushing = true;
    setImmediate(() => this.flush());
  }

  flush() {
    const chunk = this.queue.splice(0).join('\n');
    this.flushing = false;
    if (!chunk) return;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.appendFileSync(this.file, chunk + '\n', 'utf-8');
    } catch { /* the log must never crash the server */ }
  }

  // Everything the UI has, as text (for "로그 저장" / copy).
  text(lines = this.lines) {
    return lines.map((l) => `[${stamp(new Date(l.time))}] ${l.text}`).join('\n');
  }
}

module.exports = { Log, stamp };
