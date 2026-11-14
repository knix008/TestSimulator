// npm test — every feature, one coloured English line per case, then a coloured summary.
// Columns stay aligned on every run. Set NO_COLOR=1 to turn the colour off.
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { run } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const useColor = !process.env.NO_COLOR && process.env.FORCE_COLOR !== '0';
const paint = (open) => (text) => (useColor ? `\x1b[${open}m${text}\x1b[0m` : String(text));
const c = {
  bold: paint('1'), dim: paint('2'), red: paint('31'), green: paint('32'), yellow: paint('33'),
  blue: paint('34'), magenta: paint('35'), cyan: paint('36'), white: paint('97'),
  pass: paint('1;97;42'), fail: paint('1;97;41'), skip: paint('1;30;43'), title: paint('1;97;44'),
};
const palette = ['36', '35', '33', '32', '34', '96', '95', '93', '92', '94', '91', '96'].map(paint);
const featureColor = new Map();

const COL = { status: 10, feature: 22, name: 58, time: 12 };
const SUM = { feature: 22, n: 8, time: 12, result: 10 };

const strip = (text) => String(text).replace(/\x1b\[[0-9;]*m/g, '');
const pad = (text, width, align = 'left') => {
  const gap = ' '.repeat(Math.max(0, width - strip(text).length));
  return align === 'right' ? gap + text : text + gap;
};
const fit = (text, width) => {
  const value = String(text);
  if (value.length <= width) return value;
  return `${value.slice(0, Math.max(0, width - 1))}…`;
};
const formatMs = (ms) => {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)} s`;
  return `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(1)}s`;
};
const tint = (name) => {
  if (!featureColor.has(name)) featureColor.set(name, palette[featureColor.size % palette.length]);
  return featureColor.get(name);
};

function statusMark(row) {
  if (row.skipped) return c.yellow('○ SKIP');
  return row.ok ? c.green('✔ PASS') : c.red('✖ FAIL');
}

function resultBadge(ok, failed, skipped) {
  if (failed) return c.fail(' FAIL ');
  if (!ok && skipped) return c.skip(' SKIP ');
  return c.pass(' PASS ');
}

function printRow(row) {
  const feature = tint(row.feature)(fit(row.feature, COL.feature));
  const name = row.ok ? fit(row.name, COL.name) : c.red(fit(row.name, COL.name));
  const time = (row.skipped ? c.yellow : row.ok ? c.cyan : c.red)(pad(formatMs(row.ms), COL.time, 'right'));
  process.stdout.write(`  ${pad(statusMark(row), COL.status)}  ${pad(feature, COL.feature)}  ${pad(name, COL.name)}  ${time}\n`);
  if (!row.ok && row.error) {
    const indent = ' '.repeat(2 + COL.status + 2);
    for (const line of String(row.error).split(/\r?\n/).slice(0, 4)) {
      process.stdout.write(`${indent}${c.red(line)}\n`);
    }
  }
}

function header() {
  const labels = [
    pad(c.bold(c.white('STATUS')), COL.status),
    pad(c.bold(c.white('FEATURE')), COL.feature),
    pad(c.bold(c.white('TEST')), COL.name),
    pad(c.bold(c.white('TIME')), COL.time, 'right'),
  ];
  process.stdout.write(`\n  ${c.title(' MyWorkForce ')}  ${c.dim(new Date().toLocaleString('en-GB'))}\n\n`);
  process.stdout.write(`  ${labels.join('  ')}\n`);
  process.stdout.write(`  ${c.dim('─'.repeat(COL.status + COL.feature + COL.name + COL.time + 6))}\n`);
}

const rows = [];
const suites = [];

function record(row) {
  rows.push(row);
  printRow(row);
}

header();

const files = readdirSync(path.join(root, 'test', 'unit')).filter((name) => name.endsWith('.test.js')).map((name) => path.join(root, 'test', 'unit', name));
const stream = run({ files, concurrency: 1 });
for await (const event of stream) {
  const data = event.data ?? event;
  if (event.type === 'test:start') {
    suites[data.nesting] = data.name;
    suites.length = data.nesting + 1;
    continue;
  }
  if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
  if (data.details?.type === 'suite') continue;
  const skipped = Boolean(data.skip || data.todo || data.details?.skip || data.details?.todo);
  const error = data.details?.error;
  record({
    feature: data.nesting > 0 ? suites[data.nesting - 1] || 'General' : 'General',
    name: data.name,
    ok: event.type === 'test:pass',
    skipped,
    ms: Number(data.details?.duration_ms) || 0,
    error: error?.message || error?.cause?.message || '',
  });
}

process.stdout.write(`  ${c.dim('─'.repeat(COL.status + COL.feature + COL.name + COL.time + 6))}\n`);
process.stdout.write(`  ${c.dim('Desktop shell tests (cargo test)…')}\n`);

const cargo = await new Promise((resolve) => {
  const child = spawn('cargo', ['test', '--', '-Z', 'unstable-options', '--format', 'json', '--report-time'], {
    cwd: path.join(root, 'src-tauri'),
    shell: process.platform === 'win32',
    windowsHide: true,
    env: { ...process.env, RUSTC_BOOTSTRAP: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  let err = '';
  child.stdout.on('data', (chunk) => { out += chunk; });
  child.stderr.on('data', (chunk) => { err += chunk; });
  child.on('error', (error) => resolve({ code: 1, out, err, error }));
  child.on('close', (code) => resolve({ code: code ?? 1, out, err }));
});

function rustRows(output) {
  const found = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line.startsWith('{')) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type !== 'test') continue;
    if (!['ok', 'failed', 'ignored'].includes(event.event)) continue;
    const leaf = String(event.name).split('::').pop().replaceAll('_', ' ');
    found.push({
      feature: 'Desktop shell',
      name: leaf,
      ok: event.event !== 'failed',
      skipped: event.event === 'ignored',
      ms: event.exec_time != null ? event.exec_time * 1000 : 0,
      error: event.stdout || '',
    });
  }
  if (found.length) return found;
  for (const match of output.matchAll(/^test (\S+) \.\.\. (ok|FAILED|ignored)/gm)) {
    found.push({
      feature: 'Desktop shell',
      name: match[1].split('::').pop().replaceAll('_', ' '),
      ok: match[2] !== 'FAILED',
      skipped: match[2] === 'ignored',
      ms: 0,
      error: '',
    });
  }
  return found;
}

if (cargo.error && cargo.error.code === 'ENOENT') {
  record({ feature: 'Desktop shell', name: 'Cargo is not installed', ok: true, skipped: true, ms: 0, error: '' });
} else {
  const shell = rustRows(`${cargo.out}\n${cargo.err}`);
  if (!shell.length) {
    record({
      feature: 'Desktop shell',
      name: 'cargo test produced no cases',
      ok: false,
      skipped: false,
      ms: 0,
      error: `${cargo.err || cargo.out}`.trim().split(/\r?\n/).slice(-8).join('\n'),
    });
  }
  for (const row of shell) {
    if (!row.ok) row.ok = false;
    record(row);
  }
}

const features = [];
for (const row of rows) {
  let bucket = features.find((item) => item.feature === row.feature);
  if (!bucket) {
    bucket = { feature: row.feature, rows: [] };
    features.push(bucket);
  }
  bucket.rows.push(row);
}

const rule = c.dim('─'.repeat(SUM.feature + SUM.n * 4 + SUM.time + SUM.result + 14));
process.stdout.write(`\n  ${c.title(' Summary ')}\n\n`);
process.stdout.write(`  ${[
  pad(c.bold(c.white('FEATURE')), SUM.feature),
  pad(c.bold(c.white('PASSED')), SUM.n, 'right'),
  pad(c.bold(c.white('FAILED')), SUM.n, 'right'),
  pad(c.bold(c.white('SKIPPED')), SUM.n, 'right'),
  pad(c.bold(c.white('TOTAL')), SUM.n, 'right'),
  pad(c.bold(c.white('TIME')), SUM.time, 'right'),
  pad(c.bold(c.white('RESULT')), SUM.result),
].join('  ')}\n`);
process.stdout.write(`  ${rule}\n`);

let passed = 0;
let failed = 0;
let skipped = 0;
let totalMs = 0;
for (const bucket of features) {
  const ok = bucket.rows.filter((row) => row.ok && !row.skipped).length;
  const bad = bucket.rows.filter((row) => !row.ok).length;
  const skip = bucket.rows.filter((row) => row.skipped).length;
  const ms = bucket.rows.reduce((sum, row) => sum + (Number(row.ms) || 0), 0);
  passed += ok;
  failed += bad;
  skipped += skip;
  totalMs += ms;
  process.stdout.write(`  ${[
    pad(tint(bucket.feature)(fit(bucket.feature, SUM.feature)), SUM.feature),
    pad(c.green(String(ok)), SUM.n, 'right'),
    pad((bad ? c.red : c.dim)(String(bad)), SUM.n, 'right'),
    pad((skip ? c.yellow : c.dim)(String(skip)), SUM.n, 'right'),
    pad(c.white(String(bucket.rows.length)), SUM.n, 'right'),
    pad(c.cyan(formatMs(ms)), SUM.time, 'right'),
    pad(resultBadge(ok, bad, skip), SUM.result),
  ].join('  ')}\n`);
}
process.stdout.write(`  ${rule}\n`);
process.stdout.write(`  ${[
  pad(c.bold(c.white('All')), SUM.feature),
  pad(c.bold(c.green(String(passed))), SUM.n, 'right'),
  pad(c.bold((failed ? c.red : c.dim)(String(failed))), SUM.n, 'right'),
  pad(c.bold((skipped ? c.yellow : c.dim)(String(skipped))), SUM.n, 'right'),
  pad(c.bold(c.white(String(rows.length))), SUM.n, 'right'),
  pad(c.bold(c.cyan(formatMs(totalMs))), SUM.time, 'right'),
  pad(failed ? c.fail(' FAIL ') : c.pass(' PASS '), SUM.result),
].join('  ')}\n\n`);

const reportDir = path.join(root, 'test-results');
mkdirSync(reportDir, { recursive: true });
writeFileSync(path.join(reportDir, 'results.json'), JSON.stringify({
  at: new Date().toISOString(),
  passed,
  failed,
  skipped,
  ms: Math.round(totalMs),
  rows,
}, null, 2));
process.stdout.write(`  ${c.dim(`Details: ${path.join(reportDir, 'results.json')}`)}\n\n`);
process.exit(failed ? 1 : 0);
