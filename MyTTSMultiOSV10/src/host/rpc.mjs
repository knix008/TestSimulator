/**
 * The line protocol between this Node host and the Tauri program (src-tauri/src/host.rs),
 * the same one MyTerminal uses. One JSON object per line; stdout carries nothing else, so
 * console output goes to stderr.
 *
 * Tauri → host
 *   { t:'req', id, m, a }       a renderer call (m = the old Electron IPC channel name)
 *   { t:'ret', id, ok, v | e }  the answer to one of our calls
 * host → Tauri
 *   { t:'res', id, ok, v | e }  the answer to a request
 *   { t:'emit', ch, p }         an event for the window (webContents.send)
 *   { t:'call', id, m, a }      ask the program for something (native message boxes)
 */
import readline from 'node:readline';

const handlers = new Map();
const pending = new Map();
let nextCall = 1;
const stdoutWrite = process.stdout.write.bind(process.stdout);

// Nothing but protocol lines on stdout: libraries that print go to stderr.
process.stdout.write = (chunk, ...rest) => process.stderr.write(chunk, ...rest);
console.log = console.error;
console.info = console.error;

function write(msg) {
  try {
    stdoutWrite(`${JSON.stringify(msg)}\n`);
  } catch (err) {
    console.error('[host] write failed', err);
  }
}

/** Handle renderer calls on `channel`: fn(args) → value | Promise. */
export function handle(channel, fn) {
  handlers.set(channel, fn);
}

/** An event for the window (Electron's webContents.send). */
export function emit(channel, payload) {
  write({ t: 'emit', ch: channel, p: payload === undefined ? null : payload });
}

/** Ask the Tauri program to do something; resolves with its answer. */
export function call(method, args) {
  const id = nextCall++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    write({ t: 'call', id, m: method, a: args === undefined ? null : args });
  });
}

/** Tell the program we are up (it opens the window then). */
export function ready() {
  write({ t: 'call', id: 0, m: 'ready', a: null });
}

const errorText = (err) => (err && typeof err === 'object' && err.message ? String(err.message) : String(err));

async function onRequest(msg) {
  const fn = handlers.get(msg.m);
  if (!fn) {
    write({ t: 'res', id: msg.id, ok: false, e: `unknown channel: ${msg.m}` });
    return;
  }
  try {
    const value = await fn(msg.a === null ? undefined : msg.a);
    write({ t: 'res', id: msg.id, ok: true, v: value === undefined ? null : value });
  } catch (err) {
    write({ t: 'res', id: msg.id, ok: false, e: errorText(err) });
  }
}

function dispatch(line) {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    console.error('[host] bad line', line.slice(0, 200));
    return;
  }
  if (msg.t === 'req') {
    onRequest(msg);
  } else if (msg.t === 'ret') {
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (msg.ok) entry.resolve(msg.v);
    else entry.reject(new Error(msg.e || 'call failed'));
  }
}

/** Serve until the program closes our stdin; onEnd runs before exiting. */
export function start(onEnd = () => {}) {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', dispatch);
  rl.on('close', () => {
    try { onEnd(); } finally { process.exit(0); }
  });
}
