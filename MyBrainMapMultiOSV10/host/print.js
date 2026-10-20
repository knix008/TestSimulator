// Silent printing for the Tauri shell.
//
// The page is handed to Edge or Chrome. On Windows the browser profile is
// pointed at the chosen printer and `--kiosk-printing` sends the job without
// the system dialog. On macOS and Linux the page is rendered to PDF and
// given to `lp`, which is the system print spooler.
'use strict';

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PAPERS = {
  a4: [210000, 297000, 'ISO_A4', 210, 297],
  letter: [215900, 279400, 'NA_LETTER', 215.9, 279.4],
  legal: [215900, 355600, 'NA_LEGAL', 215.9, 355.6],
  a5: [148000, 210000, 'ISO_A5', 148, 210],
};

function exists(p) {
  try { return !!(p && fs.existsSync(p)); } catch { return false; }
}

function browserBin() {
  const found = [];
  if (process.platform === 'win32') {
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    found.push(
      path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    );
  } else if (process.platform === 'darwin') {
    found.push(
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    );
  }
  for (const p of found) if (exists(p)) return p;
  const names = process.platform === 'win32'
    ? []
    : ['microsoft-edge', 'microsoft-edge-stable', 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
  for (const name of names) {
    const r = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', [name], { encoding: 'utf8', windowsHide: true });
    const line = r.stdout && r.stdout.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    if (r.status === 0 && line && exists(line)) return line;
  }
  return null;
}

function runCapture(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true });
    const out = [];
    const err = [];
    child.stdout.on('data', (c) => out.push(c));
    child.stderr.on('data', (c) => err.push(c));
    child.on('error', (e) => resolve({ code: -1, stdout: '', stderr: e.message }));
    child.on('close', (code) => resolve({
      code: code == null ? -1 : code,
      stdout: Buffer.concat(out).toString('utf8'),
      stderr: Buffer.concat(err).toString('utf8'),
    }));
  });
}

async function listPrinters() {
  if (process.platform === 'win32') {
    const r = await runCapture('powershell.exe', ['-NoProfile', '-Command',
      'Get-CimInstance -ClassName Win32_Printer | Select-Object Name, Default | ConvertTo-Json -Compress']);
    if (r.code !== 0 || !r.stdout.trim()) return [];
    let rows;
    try { rows = JSON.parse(r.stdout.trim()); } catch { return []; }
    const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
    return list.filter((p) => p && p.Name).map((p) => ({ name: p.Name, displayName: p.Name, isDefault: !!p.Default }));
  }
  const listed = await runCapture('lpstat', ['-p']);
  const def = await runCapture('lpstat', ['-d']);
  const defaultName = (def.stdout.match(/:\s*(\S+)\s*$/m) || [])[1] || '';
  const names = [];
  for (const line of listed.stdout.split(/\r?\n/)) {
    const m = /^(?:printer|프린터)\s+(\S+)/i.exec(line) || /^printer\s+(\S+)/i.exec(line);
    if (m) names.push(m[1]);
  }
  return names.map((name) => ({ name, displayName: name, isDefault: name === defaultName }));
}

function applyOpts(html, opts) {
  const o = opts || {};
  const paper = PAPERS[o.pageSize] || PAPERS.a4;
  const landscape = !!o.landscape;
  const w = landscape ? paper[4] : paper[3];
  const h = landscape ? paper[3] : paper[4];
  let out = String(html || '');
  const page = `@page{size:${w}mm ${h}mm;margin:0}`;
  if (/@page\s*\{[^}]*\}/.test(out)) out = out.replace(/@page\s*\{[^}]*\}/, page);
  else if (/<head[^>]*>/i.test(out)) out = out.replace(/<head[^>]*>/i, (m) => `${m}<style>${page}</style>`);
  else out = `<style>${page}</style>${out}`;
  if (o.color === false) {
    const gray = '<style>html,body{filter:grayscale(1) !important}</style>';
    if (/<head[^>]*>/i.test(out)) out = out.replace(/<head[^>]*>/i, (m) => m + gray);
    else out = gray + out;
  }
  return out;
}

function fileUrl(p) {
  let abs = path.resolve(p).replace(/\\/g, '/');
  if (!abs.startsWith('/')) abs = `/${abs}`;
  return `file://${encodeURI(abs).replace(/#/g, '%23')}`;
}

function writeProfile(dir, opts) {
  const paper = PAPERS[(opts && opts.pageSize)] || PAPERS.a4;
  const landscape = !!(opts && opts.landscape);
  const microns = landscape ? [paper[1], paper[0]] : [paper[0], paper[1]];
  const copies = Math.max(1, Math.min(99, Number(opts && opts.copies) || 1));
  const dest = opts && opts.deviceName ? [{ id: String(opts.deviceName), origin: 'local', account: '' }] : [];
  const appState = {
    version: 2,
    recentDestinations: dest,
    isCssBackgroundEnabled: true,
    mediaSize: { width_microns: microns[0], height_microns: microns[1], name: paper[2] },
    isLandscapeEnabled: landscape,
    isColorEnabled: !(opts && opts.color === false),
    copies,
  };
  const prefs = { printing: { print_preview_sticky_settings: { version: 1, appState: JSON.stringify(appState) } } };
  const folder = path.join(dir, 'Default');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'Preferences'), JSON.stringify(prefs));
}

function spawnBrowser(bin, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { windowsHide: true });
    let done = false;
    const finish = (success, failureReason) => {
      if (done) return;
      done = true;
      resolve({ success, failureReason: failureReason || '' });
    };
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* already gone */ }
      finish(false, 'timeout');
    }, timeoutMs);
    child.on('error', (err) => { clearTimeout(timer); finish(false, err.message); });
    child.on('close', (code) => { clearTimeout(timer); finish(code === 0, code === 0 ? '' : `exit ${code}`); });
  });
}

async function printHtml(html, opts) {
  const bin = browserBin();
  if (!bin) return { success: false, failureReason: 'no-browser' };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'med-print-'));
  const page = applyOpts(html, opts);
  try {
    if (process.platform === 'win32') {
      const file = path.join(dir, 'page.html');
      const script = '<script>addEventListener("load",function(){setTimeout(function(){window.print()},30)})</script>';
      const marked = /<\/body>/i.test(page) ? page.replace(/<\/body>/i, `${script}</body>`) : page + script;
      fs.writeFileSync(file, marked);
      writeProfile(dir, opts);
      return await spawnBrowser(bin, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
        '--kiosk-printing', `--user-data-dir=${dir}`, '--virtual-time-budget=20000', fileUrl(file),
      ], 45000);
    }
    const pdf = path.join(dir, 'page.pdf');
    const file = path.join(dir, 'page.html');
    fs.writeFileSync(file, page);
    const rendered = await spawnBrowser(bin, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-pdf-header-footer',
      `--user-data-dir=${path.join(dir, 'profile')}`, `--print-to-pdf=${pdf}`, fileUrl(file),
    ], 45000);
    if (!rendered.success || !exists(pdf)) return rendered.success ? { success: false, failureReason: 'no-pdf' } : rendered;
    const copies = String(Math.max(1, Math.min(99, Number(opts && opts.copies) || 1)));
    const args = ['-n', copies];
    if (opts && opts.deviceName) args.push('-d', String(opts.deviceName));
    args.push(pdf);
    const printed = await runCapture('lp', args);
    return printed.code === 0 ? { success: true, failureReason: '' } : { success: false, failureReason: (printed.stderr || 'lp failed').trim() };
  } catch (err) {
    return { success: false, failureReason: err.message || 'print failed' };
  } finally {
    fs.rm(dir, { recursive: true, force: true }, () => {});
  }
}

module.exports = { listPrinters, printHtml };
