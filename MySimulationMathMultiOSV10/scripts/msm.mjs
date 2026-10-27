#!/usr/bin/env node
// Terminal runner for the M language (no GUI):
//
//   npm run msm                         interactive prompt (>>); "exit" or Ctrl+D ends it
//   npm run msm -- -r "disp(1)"         run code and exit
//   npm run msm -- file.m [more.m]      run script files and exit
//   options: --cd <folder>  start folder;  --no-echo  hide results of statements without ";"
//
// Exit code: 0 ok, 1 an M error, 2 the engine is missing.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createNodeFs } from '../core/fs-node.js';
import { graphicsFlush } from '../src/engine/router.js';
import { needsMoreInput } from '../src/engine/protocol.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseArgs(argv) {
  const opts = { run: [], files: [], cd: null, echo: true, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-r' || a === '--run' || a === '-e') opts.run.push(argv[++i] ?? '');
    else if (a === '--cd') opts.cd = argv[++i] ?? null;
    else if (a === '--no-echo') opts.echo = false;
    else if (a === '-h' || a === '--help') opts.help = true;
    else opts.files.push(a);
  }
  return opts;
}

/** Reads one line from stdin synchronously (the M input() function blocks). */
function readLineSync(prompt) {
  process.stdout.write(prompt);
  const buf = Buffer.alloc(1);
  let line = '';
  for (;;) {
    let n = 0;
    try { n = fs.readSync(0, buf, 0, 1, null); } catch (e) { if (e.code === 'EAGAIN') continue; return null; }
    if (n === 0) return line.length ? line : null;
    const ch = buf.toString('utf8');
    if (ch === '\n') return line.replace(/\r$/, '');
    line += ch;
  }
}

function formatError(error) {
  const lines = [`Error: ${error.message || error.identifier || 'unknown error'}`];
  for (const f of error.stack || []) lines.push(`  in ${f.name || f.file || '?'}${f.line ? ` (line ${f.line})` : ''}${f.file ? ` ${f.file}` : ''}`);
  return `${lines.join('\n')}\n`;
}

export async function loadSessionFactory() {
  const file = path.join(root, 'core', 'session.js');
  if (!fs.existsSync(file)) return null;
  const mod = await import(pathToFileURL(file).href);
  return mod.createSession || null;
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.help) {
    process.stdout.write('Usage: npm run msm -- [-r "code"]... [file.m]... [--cd folder] [--no-echo]\n');
    return 0;
  }
  let createSession = null;
  try { createSession = await loadSessionFactory(); } catch (e) {
    process.stderr.write(`The M language engine (core/session.js) failed to load: ${(e && e.message) || e}\n`);
    return 2;
  }
  if (!createSession) {
    process.stderr.write('The M language engine (core/session.js) is not installed yet.\n');
    return 2;
  }
  const fsys = createNodeFs({ cwd: opts.cd ? path.resolve(opts.cd) : process.cwd() });
  const session = createSession({
    fs: fsys,
    host: {
      post() { /* no GUI: figures and models are not shown */ },
      request(msg) {
        if (msg && msg.type === 'input') return readLineSync(String(msg.prompt || ''));
        if (msg && msg.type === 'debug.paused') {
          process.stdout.write(`Paused at ${msg.file || ''}:${msg.line || ''}\n`);
          const cmd = readLineSync('K>> ');
          if (cmd == null || cmd === 'dbcont') return 'continue';
          if (cmd === 'dbstep') return 'step';
          if (cmd === 'dbquit') return 'stop';
          return { eval: cmd };
        }
        return null;
      },
    },
    print(text, stream) { (stream === 'err' || stream === 'stderr' ? process.stderr : process.stdout).write(String(text)); },
    onEvent(ev) { if (ev && ev.type === 'clc') process.stdout.write('\x1b[2J\x1b[H'); },
  });
  const run = (fn) => {
    let r;
    try { r = fn(); } catch (e) { r = { ok: false, error: { message: (e && e.message) || String(e), identifier: e && e.identifier } }; }
    graphicsFlush(session);
    if (r && r.ok === false) { process.stderr.write(formatError(r.error || {})); return false; }
    return true;
  };

  if (opts.run.length || opts.files.length) {
    let ok = true;
    for (const code of opts.run) { ok = run(() => session.evaluate(code, { echo: opts.echo })) && ok; if (!ok) break; }
    if (ok) for (const f of opts.files) { ok = run(() => session.runFile(fsys.abs(f))) && ok; if (!ok) break; }
    return ok ? 0 : 1;
  }

  // Interactive prompt.
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
  let buffer = '';
  const prompt = () => { rl.setPrompt(buffer ? '.. ' : '>> '); rl.prompt(); };
  prompt();
  for await (const line of rl) {
    buffer = buffer ? `${buffer}\n${line}` : line;
    if (needsMoreInput(buffer)) { prompt(); continue; }
    const code = buffer;
    buffer = '';
    if (/^\s*(exit|quit)\s*;?\s*$/.test(code)) break;
    if (code.trim()) run(() => session.evaluate(code, { echo: opts.echo }));
    prompt();
  }
  rl.close();
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code), (e) => { process.stderr.write(`${(e && e.stack) || e}\n`); process.exit(1); });
}
