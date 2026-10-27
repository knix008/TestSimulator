/**
 * Programs started in a pseudo terminal owned by the Tauri program
 * (src-tauri/src/pty.rs: ConPTY on Windows, openpty elsewhere). A program
 * that sees a terminal keeps its colours, progress bars and prompts — through
 * plain pipes most of them (git, ls, npm, pip …) turn colour off.
 *
 * spawnPty() returns an EventEmitter shaped like a ChildProcess:
 *   'data' (Buffer)  'exit' (code)  'error' (Error)
 *   .pid  .write(text)  .resize(cols, rows)  .kill()
 */
const { EventEmitter } = require('events');
const rpc = require('./rpc');

/** @type {Map<string, EventEmitter>} */
const live = new Map();
/** Output that arrived before `pty.spawn` answered (keyed by pty id). */
const early = new Map();

rpc.on('pty', (msg) => {
  const id = String(msg.id);
  const child = live.get(id);
  if (!child) {
    if (!early.has(id)) early.set(id, []);
    early.get(id).push(msg);
    return;
  }
  deliver(child, msg);
});

function deliver(child, msg) {
  if (msg.ev === 'data') {
    child.emit('data', Buffer.from(String(msg.d || ''), 'base64'));
  } else if (msg.ev === 'exit') {
    live.delete(child.ptyId);
    child.exited = true;
    child.emit('exit', Number(msg.code) || 0);
  }
}

/** Windows command-line quoting for one argument (libuv's quote_cmd_arg, as Node spawns). */
function quoteWindowsArg(arg) {
  const s = String(arg ?? '');
  if (!s) return '""';
  if (!/[\s"]/.test(s)) return s;
  if (!/["\\]/.test(s)) return `"${s}"`;
  let out = '"';
  let slashes = 0;
  for (const ch of s) {
    if (ch === '\\') {
      slashes += 1;
      continue;
    }
    if (ch === '"') {
      out += `${'\\'.repeat(slashes * 2 + 1)}"`;
    } else {
      out += '\\'.repeat(slashes) + ch;
    }
    slashes = 0;
  }
  return `${out}${'\\'.repeat(slashes * 2)}"`;
}

/** The CreateProcess command line Node would build for spawn(file, args, options). */
function windowsCommandLine(file, args, { verbatim = false } = {}) {
  const head = quoteWindowsArg(file);
  const rest = (args || []).map((a) => (verbatim ? String(a) : quoteWindowsArg(a)));
  return [head, ...rest].join(' ');
}

function spawnPty(file, args, { cwd, env, cols = 80, rows = 24, verbatim = false } = {}) {
  const child = new EventEmitter();
  child.pid = 0;
  child.exited = false;
  child.ptyId = '';
  child.write = (text) => {
    if (child.ptyId && !child.exited) rpc.notify('pty.write', { id: child.ptyId, data: String(text ?? '') });
  };
  child.resize = (c, r) => {
    if (child.ptyId && !child.exited && c > 0 && r > 0) rpc.notify('pty.resize', { id: child.ptyId, cols: c, rows: r });
  };
  child.kill = () => {
    if (child.ptyId && !child.exited) rpc.notify('pty.kill', { id: child.ptyId });
  };

  rpc
    .call('pty.spawn', {
      file,
      args: (args || []).map(String),
      commandLine: process.platform === 'win32' ? windowsCommandLine(file, args, { verbatim }) : '',
      cwd: cwd || process.cwd(),
      env: env || process.env,
      cols: Math.max(1, cols | 0),
      rows: Math.max(1, rows | 0),
    })
    .then((res) => {
      child.ptyId = String(res.id);
      child.pid = Number(res.pid) || 0;
      live.set(child.ptyId, child);
      child.emit('spawn');
      const queued = early.get(child.ptyId) || [];
      early.delete(child.ptyId);
      for (const msg of queued) deliver(child, msg);
    })
    .catch((err) => {
      child.exited = true;
      child.emit('error', err);
    });
  return child;
}

module.exports = { spawnPty, quoteWindowsArg, windowsCommandLine };
