#!/usr/bin/env node
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { analyzePath, walk, listRules } = require('../core/analyze');
const { createApi } = require('../core/api');
const { DEFAULT_POLICY } = require('../core/coverity');
const cli = require('../core/covcli');
const { toHtml } = require('../core/report');

// Coverity-style workflow for this workbench. The intermediate directory
// (--dir, default <path>/.mcc) holds the capture and the last analysis.
const HELP = `Usage: node scripts/cov.mjs <command> [options]

  configure       --path <dir> [--compiler gcc|clang|cl ...]       record compilers to intercept
  build           --path <dir> [--dir <idir>] [--compile-commands <file>] [-- <build command>]
  capture         --path <dir> [--dir <idir>]                       buildless capture (all sources)
  analyze         --path <dir> [--dir <idir>] [--all] [--enable C] [--disable C]
                  [--disable-default] [--aggressiveness-level low|medium|high]
                  [--coding-standard-config misra-c2012|misra-cpp2023|cert-c|autosar|misra-c2004|misra-cpp2008|mois]
                  [--no-security] [--strip-path <prefix>]
  format-errors   --dir <idir> [--json-output-v8 <file>] [--html-output <dir>] [--text-output <file>]
  commit-defects  --path <dir> [--stream <name>] [--config <dir>] [--token <user token>]
  run-desktop     --path <dir> [--stream <name>] [--all-files]     analyze, show defects new to the stream
  make-library    --model-file <stubs.c> [--output-file <models.json>] [--config <dir>]
  import-results  --path <dir> --file <results.json> [--format coverity|sarif|...] [--stream <name>]
  manage-im       --mode defects|streams|snapshots --show [--stream <name>] [--status Outstanding|Dismissed|Fixed]
                  --mode defects --update --cid <n> --set classification:"False Positive" [--set action:Ignore ...]

Old names still work: build, analyze, commit.`;

const argv = process.argv.slice(2);
const cmd = argv[0];
if (!cmd || cmd === '--help' || cmd === 'help') { console.log(HELP); process.exit(cmd ? 0 : 2); }

const dashdash = argv.indexOf('--');
const opts = argv.slice(1, dashdash >= 0 ? dashdash : undefined);
const buildCommand = dashdash >= 0 ? argv.slice(dashdash + 1).join(' ') : '';
const arg = (name, fallback) => {
  const i = opts.indexOf(`--${name}`);
  return i >= 0 && opts[i + 1] && !opts[i + 1].startsWith('--') ? opts[i + 1] : fallback;
};
const args = (name) => opts.flatMap((v, i) => (v === `--${name}` && opts[i + 1] ? [opts[i + 1]] : []));
const flag = (name) => opts.includes(`--${name}`);
const folder = path.resolve(arg('path') || '.');
const idir = path.resolve(arg('dir', path.join(folder, '.mcc')));
const token = arg('token', process.env.MCC_TOKEN || '');
const configDir = arg('config', '') || undefined;
const api = () => createApi({ configDir });

const needFolder = () => {
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    console.error(`Folder not found: ${folder}`);
    process.exit(2);
  }
};
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
const writeJson = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2)); };
const rel = (f) => path.relative(folder, f).replace(/\\/g, '/');

async function main() {
  switch (cmd) {
    case 'configure': {
      needFolder();
      const compilers = args('compiler').length ? args('compiler') : cli.COMPILERS;
      writeJson(path.join(idir, 'config.json'), { compilers, configuredAt: new Date().toISOString() });
      console.log(`[cov-configure] ${compilers.join(', ')} → ${path.join(idir, 'config.json')}`);
      return 0;
    }
    case 'build': {
      needFolder();
      let units = [];
      let status = 0;
      const cc = arg('compile-commands') || (fs.existsSync(path.join(folder, 'compile_commands.json')) && !buildCommand ? path.join(folder, 'compile_commands.json') : '');
      if (buildCommand) {
        const r = cli.runBuild(buildCommand, folder, idir);
        units = r.units;
        status = r.status;
      } else if (cc) {
        units = cli.readCompileCommands(cc);
      }
      const files = walk(folder, {}).map(rel);
      const capture = { capturedAt: new Date().toISOString(), root: folder, mode: buildCommand ? 'build' : cc ? 'compile-commands' : 'buildless', buildStatus: status, units: units.map((u) => ({ ...u, file: rel(u.file) })), files };
      writeJson(path.join(idir, 'capture.json'), capture);
      console.log(`[cov-build] ${capture.mode}: ${units.length} compilation units, ${files.length} files → ${path.join(idir, 'capture.json')}`);
      if (buildCommand && !units.length) console.log('[cov-build] warning: no compiler invocation was seen; is the build up to date? (try a clean build)');
      return status;
    }
    case 'capture': {
      needFolder();
      const files = walk(folder, {}).map(rel);
      writeJson(path.join(idir, 'capture.json'), { capturedAt: new Date().toISOString(), root: folder, mode: 'buildless', units: [], files });
      console.log(`[cov-capture] ${files.length} files → ${path.join(idir, 'capture.json')}`);
      return 0;
    }
    case 'analyze': {
      needFolder();
      const capture = readJson(path.join(idir, 'capture.json'), null);
      const settings = cli.analysisOptions({
        all: flag('all'), enable: args('enable'), disable: args('disable'), disableDefault: flag('disable-default'),
        aggressiveness: arg('aggressiveness-level', 'medium'),
        codingStandards: args('coding-standard-config').flatMap((s) => s.split(',')),
        security: !flag('no-security'),
      }, listRules());
      const units = capture && capture.units ? capture.units.map((u) => ({ ...u, file: path.resolve(folder, u.file) })) : [];
      const merged = cli.mergeUnits(units);
      const analysis = analyzePath(folder, {
        inactive: [...settings.inactive], policy: DEFAULT_POLICY, absint: settings.absint,
        cfamily: { includeDirs: merged.includeDirs, defines: merged.defines },
      });
      analysis.issues = analysis.issues.filter(settings.filter);
      writeJson(path.join(idir, 'output', 'analysis.json'), analysis);
      const withChecker = analysis.issues.filter((i) => i.checker);
      const byChecker = {};
      for (const i of withChecker) byChecker[i.checker] = (byChecker[i.checker] || 0) + 1;
      console.log(`[cov-analyze] aggressiveness=${settings.level} units=${units.length} defects=${withChecker.length} checkers=${Object.keys(byChecker).length}`);
      for (const [name, n] of Object.entries(byChecker).sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  ${name.padEnd(32)} ${n}`);
      return 0;
    }
    case 'format-errors': {
      const analysis = readJson(path.join(idir, 'output', 'analysis.json'), null);
      if (!analysis) { console.error(`No analysis in ${idir}; run analyze first.`); return 2; }
      let wrote = false;
      const v8 = arg('json-output-v8') || arg('json-output-v7');
      if (v8) { writeJson(path.resolve(v8), cli.toJsonV8(analysis, { stripPath: arg('strip-path') })); console.log(`[cov-format-errors] JSON v8 → ${path.resolve(v8)}`); wrote = true; }
      const html = arg('html-output');
      if (html) {
        fs.mkdirSync(path.resolve(html), { recursive: true });
        fs.writeFileSync(path.join(path.resolve(html), 'index.html'), toHtml(analysis, arg('lang', 'en')));
        console.log(`[cov-format-errors] HTML → ${path.join(path.resolve(html), 'index.html')}`);
        wrote = true;
      }
      const textOut = arg('text-output');
      if (textOut || !wrote) {
        const body = cli.formatText(analysis, 100000);
        if (textOut) fs.writeFileSync(path.resolve(textOut), body); else console.log(body);
      }
      return 0;
    }
    case 'commit':
    case 'commit-defects': {
      needFolder();
      const result = await api().call('project.scan', { path: folder, branch: arg('stream', 'main'), commit: true }, { token });
      const c = result.analysis.coverity;
      console.log(`[cov-commit] snapshot=${c.snapshot} stream=${c.stream} policy=${c.policy.status} outstanding=${c.outstanding} new=${c.newlyDetected} fixed=${c.fixed}`);
      return c.policy.status === 'OK' ? 0 : 1;
    }
    case 'run-desktop': {
      needFolder();
      const a = api();
      const stream = arg('stream', 'main');
      const ws = a.store.load();
      const project = (ws.projects || []).find((p) => path.resolve(p.path) === folder);
      const known = new Set((project && project.branches && project.branches[stream] && project.branches[stream].cids) || []);
      const res = await a.call('project.scan', { path: folder, branch: stream, commit: false }, { token });
      let changed = null;
      if (!flag('all-files')) {
        const scm = require('../core/platform/scm');
        try { changed = await scm.changedLines(folder, null, {}); } catch { changed = null; }
      }
      const files = changed && changed.files ? new Set(Object.keys(changed.files)) : null;
      const fresh = res.analysis.issues.filter((i) => i.checker && i.cid && !known.has(i.cid) && (!files || files.has(i.file)));
      console.log(`[cov-run-desktop] stream=${stream} reference=${known.size ? 'last commit' : 'none'} new defects=${fresh.length}${files ? ` in ${files.size} changed files` : ''}`);
      console.log(cli.formatText({ issues: fresh }, 200));
      return fresh.some((i) => i.impact === 'High') ? 1 : 0;
    }
    case 'make-library': {
      const file = arg('model-file');
      if (!file) { console.error('--model-file is required'); return 2; }
      const { models, unsupported } = cli.makeLibrary(fs.readFileSync(path.resolve(file), 'utf8'));
      for (const u of unsupported) console.log(`[cov-make-library] warning: ${u.name} uses ${u.primitive}, which has no model kind here`);
      const out = arg('output-file');
      if (out) writeJson(path.resolve(out), models);
      else {
        const a = api();
        const ws = a.store.load();
        ws.coverity = ws.coverity || {};
        const names = new Set(models.map((m) => m.name));
        ws.coverity.models = [...(ws.coverity.models || []).filter((m) => !names.has(m.name)), ...models];
        a.store.save(ws);
      }
      console.log(`[cov-make-library] ${models.length} models${out ? ` → ${path.resolve(out)}` : ' added to the workspace'}`);
      return 0;
    }
    case 'import-results': {
      needFolder();
      const file = arg('file');
      if (!file) { console.error('--file is required'); return 2; }
      const a = api();
      let ws = a.store.load();
      let project = (ws.projects || []).find((p) => path.resolve(p.path) === folder);
      if (!project) { await a.call('project.scan', { path: folder, branch: arg('stream', 'main') }, { token }); ws = a.store.load(); project = ws.projects.find((p) => path.resolve(p.path) === folder); }
      const r = await a.call('external.import', { projectId: project.id, branch: arg('stream', 'main'), file: path.resolve(file), format: arg('format') }, { token });
      console.log(`[cov-import-results] ${r.format}: ${r.count} issues from ${r.engine}`);
      return 0;
    }
    case 'manage-im': {
      const a = api();
      const ws = a.store.load();
      const mode = arg('mode', 'defects');
      const stream = arg('stream', 'main');
      const project = (ws.projects || []).find((p) => path.resolve(p.path) === folder) || (ws.projects || []).find((p) => p.id === ws.activeProjectId);
      if (!project) { console.error('No project; commit defects first.'); return 2; }
      if (mode === 'streams') {
        for (const [name, b] of Object.entries(project.branches || {})) console.log(`${name}\tsnapshot ${b.snapshot || 0}\t${b.updatedAt || ''}`);
        return 0;
      }
      if (mode === 'snapshots') {
        for (const s of ((project.branches || {})[stream] || {}).snapshots || []) console.log(`${s.snapshot}\t${s.at}\t${(s.issues || []).length} defects`);
        return 0;
      }
      const latest = ((project.branches || {})[stream] || {}).latest;
      if (!latest) { console.error(`No snapshot in stream ${stream}`); return 2; }
      if (flag('update')) {
        const cid = arg('cid');
        const target = latest.issues.find((i) => String(i.cid) === String(cid));
        if (!target) { console.error(`CID not found: ${cid}`); return 2; }
        const patch = {};
        for (const s of args('set')) {
          const k = s.indexOf(':');
          const key = s.slice(0, k).trim();
          const value = s.slice(k + 1).trim().replace(/^"|"$/g, '');
          const map = { classification: 'classification', action: 'action', severity: 'triageSeverity', owner: 'owner', 'ext-reference': 'externalReference', legacy: 'legacy', comment: 'comment' };
          if (!map[key]) { console.error(`Unknown attribute: ${key}`); return 2; }
          patch[map[key]] = key === 'legacy' ? /^(true|yes|1)$/i.test(value) : value;
        }
        await a.call('issue.update', { projectId: project.id, keys: [target.key], patch: { ...patch, cid: target.cid } }, { token });
        console.log(`[cov-manage-im] CID ${cid} updated`);
        return 0;
      }
      const status = arg('status');
      for (const i of latest.issues.filter((x) => x.checker && (!status || (x.coverityStatus || 'Outstanding') === status))) {
        console.log(`${i.cid}\t${i.checker}\t${i.impact}\t${i.classification || 'Unclassified'}\t${i.action || 'Undecided'}\t${i.file}:${i.line}`);
      }
      return 0;
    }
    default:
      console.error(`Unknown command: ${cmd}\n\n${HELP}`);
      return 2;
  }
}

process.exit(await main());
