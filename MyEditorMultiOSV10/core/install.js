// Installing a formatter or checker that is not there: the app offers to
// install it and runs the package manager here, streaming the output to the
// progress popup (install.start → install.status long poll). npm packages go
// under <config>/tools/node via `node npm-cli.js` (not npm.cmd — that crashes
// on Windows with 0xC0000409 when the prefix path contains a space, as in
// "My Editor"). Other tools land in the user's own location (pip --user,
// cargo, go, gem, rustup, PowerShell modules).
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { onPath } = require('./lint');
const { findPython, findNode, findNpmCli, installRuntime, runtimeMissing } = require('./runtime');

// tool id → how to install it. kind: npm | pip | cargo | go | gem | rustup | psmodule | manual
const RECIPES = {
  prettier: { kind: 'npm', pkg: 'prettier' },
  'sql-formatter': { kind: 'npm', pkg: 'sql-formatter' },
  eslint: { kind: 'npm', pkg: 'eslint' },
  markdownlint: { kind: 'npm', pkg: 'markdownlint-cli', bin: 'markdownlint' },
  stylelint: { kind: 'npm', pkg: 'stylelint' },
  black: { kind: 'pip', pkg: 'black', module: 'black' },
  ruff: { kind: 'pip', pkg: 'ruff', module: 'ruff' },
  pyflakes: { kind: 'pip', pkg: 'pyflakes', module: 'pyflakes' },
  yamllint: { kind: 'pip', pkg: 'yamllint', module: 'yamllint' },
  shellcheck: { kind: 'pip', pkg: 'shellcheck-py', module: 'shellcheck' },
  autopep8: { kind: 'pip', pkg: 'autopep8', module: 'autopep8' },
  yapf: { kind: 'pip', pkg: 'yapf', module: 'yapf' },
  'clang-format': { kind: 'pip', pkg: 'clang-format', module: 'clang_format' },
  stylua: { kind: 'cargo', crate: 'stylua' },
  shfmt: { kind: 'go', pkg: 'mvdan.cc/sh/v3/cmd/shfmt@latest' },
  goimports: { kind: 'go', pkg: 'golang.org/x/tools/cmd/goimports@latest' },
  kubeconform: { kind: 'go', pkg: 'github.com/yannh/kubeconform/cmd/kubeconform@latest' },
  rustfmt: { kind: 'rustup', component: 'rustfmt' },
  rubocop: { kind: 'gem', pkg: 'rubocop' },
  pssa: { kind: 'psmodule', module: 'PSScriptAnalyzer' },
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

const python = (toolsDir) => findPython(toolsDir);

function childEnv(base) {
  const env = { ...base, PIP_DISABLE_PIP_VERSION_CHECK: '1', NO_COLOR: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ASAR;
  return env;
}

function isNtCrash(code) {
  return code === 3221226505 || code === -1073740791 || (code >>> 0) === 0xC0000409;
}

function exitNote(code) {
  if (code === 0) return '\n[installed]\n';
  if (isNtCrash(code)) return `\n[exit code ${code} — npm.cmd crashed (Windows 0xC0000409). Install through node npm-cli.js instead.]\n`;
  return `\n[exit code ${code}]\n`;
}

// The command line that installs a recipe (null when a package manager is
// missing → { missing }). With `reinstall` whatever is there is replaced: the
// app's own npm copy is deleted first, pip / cargo / gem / rustup are told to
// force a fresh install.
function commandFor(recipe, toolsDir, reinstall = false) {
  switch (recipe.kind) {
    case 'npm': {
      const prefix = path.join(toolsDir, 'node');
      fs.mkdirSync(prefix, { recursive: true });
      if (reinstall) { try { fs.rmSync(path.join(prefix, 'node_modules', recipe.pkg), { recursive: true, force: true }); } catch { /* not there */ } }
      const args = ['install', '--no-fund', '--no-audit', ...(reinstall ? ['--force'] : []), '--prefix', prefix, recipe.pkg];
      // npm.cmd via cmd.exe dies with 0xC0000409 when --prefix has a space
      // (the app's folder is "My Editor"). node + npm-cli.js avoids cmd.exe.
      const via = findNpmCli(toolsDir);
      if (via) return { cmd: via.node, args: [via.cli, ...args] };
      const npm = onPath('npm');
      if (!npm && !findNode(toolsDir)) return runtimeMissing('npm');
      if (!npm) return runtimeMissing('npm');
      return { cmd: npm, args, shell: /\.(cmd|bat)$/i.test(npm) };
    }
    case 'pip': { const py = python(toolsDir); if (!py) return runtimeMissing('pip'); return { cmd: py, args: ['-m', 'pip', 'install', '--user', '--upgrade', ...(reinstall ? ['--force-reinstall', '--no-cache-dir'] : []), recipe.pkg] }; }
    case 'cargo': { const cargo = onPath('cargo'); if (!cargo) return { missing: 'cargo (Rust)' }; return { cmd: cargo, args: ['install', ...(reinstall ? ['--force'] : []), recipe.crate] }; }
    case 'go': { const go = onPath('go'); if (!go) return { missing: 'go' }; return { cmd: go, args: ['install', recipe.pkg] }; }
    case 'gem': { const gem = onPath('gem'); if (!gem) return { missing: 'gem (Ruby)' }; return { cmd: gem, args: ['install', ...(reinstall ? ['--force'] : []), recipe.pkg], shell: /\.(cmd|bat)$/i.test(gem) }; }
    case 'rustup': { const rustup = onPath('rustup'); if (!rustup) return { missing: 'rustup' }; return reinstall ? { cmd: rustup, args: ['component', 'remove', recipe.component], then: { cmd: rustup, args: ['component', 'add', recipe.component] } } : { cmd: rustup, args: ['component', 'add', recipe.component] }; }
    case 'psmodule': { const ps = onPath('pwsh') || onPath('powershell'); if (!ps) return { missing: 'PowerShell' }; return { cmd: ps, args: ['-NoProfile', '-NonInteractive', '-Command', `Install-Module ${recipe.module} -Scope CurrentUser -Force -AllowClobber; Get-Module -ListAvailable ${recipe.module} | Select-Object -First 1 | Out-String`] }; }
    default: return { manual: recipe.hint };
  }
}

function spawnInstall(step, env) {
  // Do not concatenate a quoted command line for shell:true — Node then wraps
  // it again in cmd.exe /s /c "…", and npm.cmd abort()s (exit 3221226505).
  if (step.shell) return spawn(step.cmd, step.args, { stdio: 'pipe', windowsHide: true, shell: true, env });
  return spawn(step.cmd, step.args, { stdio: 'pipe', windowsHide: true, env });
}

function createInstaller({ toolsDir }) {
  const jobs = new Map();
  let nextId = 1;
  const wake = (j) => { const w = j.waiters; j.waiters = []; for (const f of w) f(); };
  const log = (j, text) => { j.log.push(text); if (j.log.length > 2000) j.log.splice(0, j.log.length - 2000); j.seq++; wake(j); };

  return {
    recipes: () => Object.fromEntries(Object.entries(RECIPES).map(([k, r]) => [k, { kind: r.kind, hint: r.hint || null }])),
    // Starts installing `tool`. → { id } | { manual: hint } | { missing, runtime? }
    // `installRuntime`: if Python / Node.js is missing, install it first then the tool.
    start({ tool, reinstall = false, installRuntime: wantRuntime = false }) {
      const recipe = RECIPES[tool];
      if (!recipe) return { error: `no install recipe for ${tool}` };
      let c = commandFor(recipe, toolsDir, reinstall);
      if (c.manual) return { manual: c.manual };
      if (c.missing && !(wantRuntime && c.runtime)) return { missing: c.missing, runtime: c.runtime || null };
      const id = nextId++;
      const j = { id, tool, kind: c.runtime ? 'runtime' : recipe.kind, state: 'running', code: null, log: [], seq: 0, waiters: [], proc: null, command: '', afterRuntime: null };
      jobs.set(id, j);
      const beginPackage = () => {
        const next = commandFor(recipe, toolsDir, reinstall);
        if (next.missing) { j.state = 'failed'; log(j, `[${next.missing} still missing]\n`); wake(j); return; }
        j.kind = recipe.kind;
        j.command = `${path.basename(next.cmd)} ${next.args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`;
        runStep(next, !next.then);
      };
      const runStep = (step, last) => {
        log(j, `$ ${path.basename(step.cmd)} ${step.args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}\n`);
        j.command = `${path.basename(step.cmd)} ${step.args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`;
        let proc;
        try {
          proc = spawnInstall(step, childEnv(process.env));
        } catch (err) { j.state = 'failed'; log(j, `[${err.message}]\n`); wake(j); return; }
        j.proc = proc;
        proc.stdout.on('data', (d) => log(j, d.toString('utf8')));
        proc.stderr.on('data', (d) => log(j, d.toString('utf8')));
        proc.on('error', (err) => { j.state = 'failed'; log(j, `[${err.message}]\n`); wake(j); });
        proc.on('close', (code) => {
          if (j.state === 'cancelled') { j.code = code; log(j, '\n[cancelled]\n'); wake(j); return; }
          if (!last && code === 0 && step.then) { runStep(step.then, true); return; }
          if (code === 0 && j.afterRuntime) { j.afterRuntime = null; try { require('./lint').forgetBins(); } catch { /* circular load */ } beginPackage(); return; }
          j.code = code; j.state = code === 0 ? 'done' : 'failed'; log(j, exitNote(code));
          if (code === 0) {
            try { require('./lint').forgetBins(); } catch { /* circular load */ }
            try { require('./format').refresh(); } catch { /* optional */ }
          }
          wake(j);
        });
        proc.stdin.end();
      };
      if (c.missing && wantRuntime && c.runtime) {
        j.kind = 'runtime';
        j.command = `install ${c.runtime}`;
        j.afterRuntime = true;
        log(j, `installing ${c.missing} first\n`);
        const stop = { killed: false };
        j.proc = { kill() { stop.killed = true; } };
        installRuntime(c.runtime, toolsDir, (text) => log(j, text)).then(() => {
          if (j.state === 'cancelled' || stop.killed) { log(j, '\n[cancelled]\n'); wake(j); return; }
          try { require('./lint').forgetBins(); } catch { /* circular load */ }
          j.afterRuntime = null;
          beginPackage();
        }).catch((err) => {
          if (j.state === 'cancelled') return;
          j.state = 'failed'; log(j, `[${err.message}]\n`); wake(j);
        });
        return { id };
      }
      j.command = `${path.basename(c.cmd)} ${c.args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`;
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

module.exports = { createInstaller, RECIPES, commandFor, findNpmCli, isNtCrash };
