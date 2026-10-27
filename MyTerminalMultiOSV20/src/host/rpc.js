/**
 * The line protocol between this Node host and the Tauri program
 * (src-tauri/src/host.rs). One JSON object per line; stdout carries nothing
 * else, so console.log goes to stderr.
 *
 * Tauri → host
 *   { t:'req', id, win, m, a }      a renderer call (m = the Electron IPC channel name)
 *   { t:'ret', id, ok, v | e }      the answer to one of our calls
 *   { t:'pty', id, ev:'data', d }   output of a program started with `pty.spawn` (base64)
 *   { t:'pty', id, ev:'exit', code }
 *   { t:'win-closed', win }         a terminal window is gone
 * host → Tauri
 *   { t:'res', id, ok, v | e }      the answer to a request
 *   { t:'emit', win, ch, p }        an event for one window (webContents.send)
 *   { t:'call', id, m, a }          ask the program for something (dialogs, PTYs, images …)
 */
const readline = require('readline');

console.log = console.error;
console.info = console.error;

const handlers = new Map();
const listeners = new Map();
const pending = new Map();
let nextCall = 1;

function write(msg) {
  try {
    process.stdout.write(`${JSON.stringify(msg)}\n`);
  } catch (err) {
    console.error('[host] write failed', err);
  }
}

/** Handle renderer calls on `channel`: fn(args, ctx) → value | Promise. ctx.win is the calling window. */
function handle(channel, fn) {
  handlers.set(channel, fn);
}

/** Messages other than requests and answers (pty, win-closed). */
function on(type, fn) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
}

function emit(win, channel, payload) {
  if (!win) return;
  write({ t: 'emit', win, ch: channel, p: payload === undefined ? null : payload });
}

/** Ask the Tauri program to do something; resolves with its answer. */
function call(method, args) {
  const id = nextCall++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    write({ t: 'call', id, m: method, a: args === undefined ? null : args });
  });
}

/** Fire-and-forget call (writes to a PTY, resizes …). */
function notify(method, args) {
  write({ t: 'call', id: 0, m: method, a: args === undefined ? null : args });
}

function errorText(err) {
  if (err && typeof err === 'object' && err.message) return String(err.message);
  return String(err);
}

async function onRequest(msg) {
  const fn = handlers.get(msg.m);
  if (!fn) {
    write({ t: 'res', id: msg.id, ok: false, e: `unknown channel: ${msg.m}` });
    return;
  }
  try {
    const value = await fn(msg.a === null ? undefined : msg.a, { win: msg.win || null });
    write({ t: 'res', id: msg.id, ok: true, v: value === undefined ? null : value });
  } catch (err) {
    console.error(`[host] ${msg.m} failed`, err);
    write({ t: 'res', id: msg.id, ok: false, e: errorText(err) });
  }
}

function dispatch(line) {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch (err) {
    console.error('[host] bad line', line.slice(0, 200));
    return;
  }
  if (msg.t === 'req') {
    onRequest(msg);
    return;
  }
  if (msg.t === 'ret') {
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (msg.ok) entry.resolve(msg.v);
    else entry.reject(new Error(msg.e || 'call failed'));
    return;
  }
  const set = listeners.get(msg.t);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(msg);
    } catch (err) {
      console.error(`[host] ${msg.t} listener failed`, err);
    }
  }
}

function start() {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', dispatch);
  // The program is gone (or closed our stdin): nothing left to serve.
  rl.on('close', () => {
    const set = listeners.get('eof');
    if (set) for (const fn of set) fn();
    process.exit(0);
  });
}

module.exports = { handle, on, emit, call, notify, start };
