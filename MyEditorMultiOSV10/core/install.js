// Installing a formatter that is not there: when the user chose a tool that
// is not installed and formats a document, the app offers to install it and
// runs the package manager for it here, streaming the output to the
// progress popup (install.start → install.status long poll). Where a tool
// lands is private to the app when possible (npm packages go under
// <config>/tools/node), otherwise the user's own location (pip --user,
// cargo, go, gem, rustup, PowerShell modules); core/format.js knows how to
// find and run each of those.
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { onPath } = require('./lint');

// tool id → how to install it. kind: npm | pip | cargo | go | gem | rustup | psmodule | manual
const RECIPES = {
  prettier: { kind: 'npm', pkg: 'prettier' },
  'sql-formatter': { kind: 'npm', pkg: 'sql-formatter' },
  black: { kind: 'pip', pkg: 'black', module: 'black' },
  ruff: { kind: 'pip', pkg: 'ruff', module: 'ruff' },
  autopep8: { kind: 'pip', pkg: 'autopep8', module: 'autopep8' },
  yapf: { kind: 'pip', pkg: 'yapf', module: 'yapf' },
  'clang-format': { kind: 'pip', pkg: 'clang-format', module: 'clang_format' },
  stylua: { kind: 'cargo', crate: 'stylua' },
  shfmt: { kind: 'go', pkg: 'mvdan.cc/sh/v3/cmd/shfmt@latest' },
  goimports: { kind: 'go', pkg: 'golang.org/x/tools/cmd/goimports@latest' },
  rustfmt: { kind: 'rustup', component: 'rustfmt' },
  rubocop: { kind: 'gem', pkg: 'rubocop' },
  rufo: { kind: 'gem', pkg: 'rufo' },
  PSScriptAnalyzer: { kind: 'psmodule', module: 'PSScriptAnalyzer' },
  gofmt: { kind: 'manual', hint: 'Go 를 설치하면 gofmt 가 함께 설치됩니다 (https://go.dev/dl/)' },
  dart: { kind: 'manual', hint: 'Dart SDK 를 설치하세요 (https://dart.dev/get-dart)' },
  ktlint: { kind: 'manual', hint: 'ktlint 를 설치하세요 (https://pinterest.github.io/ktlint/)' },
  swiftformat: { kind: 'manual', hint: 'SwiftFormat 을 설치하세요 (brew install swiftformat)' },
  'php-cs-fixer': { kind: 'manual', hint: 'composer global require friendsofphp/php-cs-fixer' },
  'google-java-format': { kind: 'manual', hint: 'google-java-format 을 설치하세요 (https://github.com/google/google-java-format)' },
  xmllint: { kind: 'manual', hint: 'libxml2 의 xmllint 를 설치하세요 (Windows: choco install xsltproc / Linux: libxml2-utils)' },
};

const python = () => onPath('python') || onPath('python3') || onPath('py');

// The command line that installs a recipe (null when a package manager is
// missing → { missing }). With `reinstall` whatever is there is replaced: the
// app's own npm copy is deleted first, pip / cargo / gem / rustup are told to
// force a fresh install.
function commandFor(recipe, toolsDir, reinstall = false) {
  switch (recipe.kind) {
    case 'npm': {
      const npm = onPath('npm'); if (!npm) return { missing: 'npm (Node.js)' };
      fs.mkdirSync(toolsDir, { recursive: true });
      if (reinstall) { try { fs.rmSync(path.join(toolsDir, 'node', 'node_modules', recipe.pkg), { recursive: true, force: true }); } catch { /* not there */ } }
      return { cmd: npm, args: ['install', '--no-fund', '--no-audit', ...(reinstall ? ['--force'] : []), '--prefix', path.join(toolsDir, 'node'), recipe.pkg], shell: /\.cmd$/i.test(npm) };
    }
    case 'pip': { const py = python(); if (!py) return { missing: 'Python' }; return { cmd: py, args: ['-m', 'pip', 'install', '--user', '--upgrade', ...(reinstall ? ['--force-reinstall', '--no-cache-dir'] : []), recipe.pkg] }; }
    case 'cargo': { const cargo = onPath('cargo'); if (!cargo) return { missing: 'cargo (Rust)' }; return { cmd: cargo, args: ['install', ...(reinstall ? ['--force'] : []), recipe.crate] }; }
    case 'go': { const go = onPath('go'); if (!go) return { missing: 'go' }; return { cmd: go, args: ['install', recipe.pkg] }; }
    case 'gem': { const gem = onPath('gem'); if (!gem) return { missing: 'gem (Ruby)' }; return { cmd: gem, args: ['install', ...(reinstall ? ['--force'] : []), recipe.pkg], shell: /\.(cmd|bat)$/i.test(gem) }; }
    case 'rustup': { const rustup = onPath('rustup'); if (!rustup) return { missing: 'rustup' }; return reinstall ? { cmd: rustup, args: ['component', 'remove', recipe.component], then: { cmd: rustup, args: ['component', 'add', recipe.component] } } : { cmd: rustup, args: ['component', 'add', recipe.component] }; }
    case 'psmodule': { const ps = onPath('pwsh') || onPath('powershell'); if (!ps) return { missing: 'PowerShell' }; return { cmd: ps, args: ['-NoProfile', '-NonInteractive', '-Command', `Install-Module ${recipe.module} -Scope CurrentUser -Force -AllowClobber; Get-Module -ListAvailable ${recipe.module} | Select-Object -First 1 | Out-String`] }; }
    default: return { manual: recipe.hint };
  }
}

function createInstaller({ toolsDir }) {
  const jobs = new Map();
  let nextId = 1;
  const wake = (j) => { const w = j.waiters; j.waiters = []; for (const f of w) f(); };
  const log = (j, text) => { j.log.push(text); if (j.log.length > 2000) j.log.splice(0, j.log.length - 2000); j.seq++; wake(j); };

  return {
    recipes: () => Object.fromEntries(Object.entries(RECIPES).map(([k, r]) => [k, { kind: r.kind, hint: r.hint || null }])),
    // Starts installing `tool`. → { id } | { manual: hint } | { missing: what }
    start({ tool, reinstall = false }) {
      const recipe = RECIPES[tool];
      if (!recipe) return { error: `no install recipe for ${tool}` };
      const c = commandFor(recipe, toolsDir, reinstall);
      if (c.manual) return { manual: c.manual };
      if (c.missing) return { missing: c.missing };
      const id = nextId++;
      const j = { id, tool, kind: recipe.kind, state: 'running', code: null, log: [], seq: 0, waiters: [], proc: null, command: `${path.basename(c.cmd)} ${c.args.join(' ')}` };
      jobs.set(id, j);
      const runStep = (step, last) => {
        log(j, `$ ${path.basename(step.cmd)} ${step.args.join(' ')}\n`);
        let proc;
        try {
          const env = { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1', NO_COLOR: '1' };
          proc = step.shell
            ? spawn(`"${step.cmd}" ${step.args.map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(' ')}`, { stdio: 'pipe', windowsHide: true, shell: true, env })
            : spawn(step.cmd, step.args, { stdio: 'pipe', windowsHide: true, env });
        } catch (err) { j.state = 'failed'; log(j, `[${err.message}]\n`); return; }
        j.proc = proc;
        proc.stdout.on('data', (d) => log(j, d.toString('utf8')));
        proc.stderr.on('data', (d) => log(j, d.toString('utf8')));
        proc.on('error', (err) => { j.state = 'failed'; log(j, `[${err.message}]\n`); });
        proc.on('close', (code) => {
          if (j.state === 'cancelled') { j.code = code; log(j, '\n[cancelled]\n'); return; }
          if (!last && code === 0 && step.then) { runStep(step.then, true); return; }
          j.code = code; j.state = code === 0 ? 'done' : 'failed'; log(j, code === 0 ? '\n[installed]\n' : `\n[exit code ${code}]\n`);
        });
        proc.stdin.end();
      };
      runStep(c, !c.then);
      return { id };
    },
    // Long poll: the log since `since`, the state; answers when something changes.
    async status({ id, since = 0, wait = 0 }) {
      const j = jobs.get(id);
      if (!j) return null;
      const snap = () => ({ id: j.id, tool: j.tool, kind: j.kind, state: j.state, code: j.code, command: j.command, seq: j.seq, log: j.log.slice(Math.max(0, j.log.length - Math.max(0, j.seq - since))) });
      if (!wait || j.seq > since || j.state !== 'running') return snap();
      await new Promise((resolve) => { const t = setTimeout(resolve, Math.min(wait, 5000)); j.waiters.push(() => { clearTimeout(t); resolve(); }); });
      return snap();
    },
    cancel({ id }) { const j = jobs.get(id); if (!j) return false; if (j.state === 'running') { j.state = 'cancelled'; try { j.proc.kill(); } catch { /* gone */ } } wake(j); return true; },
    shutdown() { for (const j of jobs.values()) if (j.state === 'running') { try { j.proc.kill(); } catch { /* gone */ } } },
  };
}

module.exports = { createInstaller, RECIPES };
