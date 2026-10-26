'use strict';

// Coverity-style command line (scripts/cov.mjs): build capture through
// compiler shims or compile_commands.json, analysis options (checker
// enable/disable, aggressiveness, coding standards), JSON v8 output, desktop
// analysis, function models from C stubs and defect management.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const COMPILERS = ['cc', 'gcc', 'g++', 'c++', 'clang', 'clang++', 'cl', 'clang-cl', 'arm-none-eabi-gcc', 'arm-none-eabi-g++'];
const C_EXT = /\.(c|cc|cpp|cxx|c\+\+|C|m|mm)$/;

// ---------------------------------------------------------------------------
// Compiler command lines

function splitCommand(cmd) {
  const out = [];
  let cur = '';
  let quote = null;
  let any = false;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && (cmd[i + 1] === '"' || cmd[i + 1] === '\\')) cur += cmd[++i];
      else cur += c;
    } else if (c === '"' || c === "'") { quote = c; any = true; }
    else if (/\s/.test(c)) { if (cur || any) out.push(cur); cur = ''; any = false; }
    else cur += c;
  }
  if (cur || any) out.push(cur);
  return out;
}

/** Sources, include dirs and defines of one compiler invocation (GCC/Clang or MSVC style). */
function parseCompilerArgs(argv, cwd) {
  const args = Array.isArray(argv) ? argv.slice() : splitCommand(String(argv));
  const compiler = path.basename(args.shift() || '').replace(/\.exe$/i, '');
  const msvc = /^(cl|clang-cl)$/i.test(compiler);
  const res = { compiler, sources: [], includeDirs: [], defines: {}, std: null, lang: null };
  const abs = (p) => path.resolve(cwd || '.', p);
  for (let i = 0; i < args.length; i++) {
    let a = args[i];
    const val = (prefixLen) => (a.length > prefixLen ? a.slice(prefixLen) : args[++i]);
    if (a.startsWith('@')) continue;
    if (msvc && a.startsWith('/')) a = '-' + a.slice(1);
    if (a === '-I' || a.startsWith('-I')) res.includeDirs.push(abs(val(2)));
    else if (a === '-isystem' || a === '-iquote') res.includeDirs.push(abs(args[++i]));
    else if (a === '-D' || a.startsWith('-D')) {
      const d = val(2);
      const eq = d.indexOf('=');
      if (eq < 0) res.defines[d] = '1'; else res.defines[d.slice(0, eq)] = d.slice(eq + 1);
    } else if (a === '-U' || a.startsWith('-U')) delete res.defines[val(2)];
    else if (/^-std[=:]/.test(a)) res.std = a.slice(5);
    else if (a === '-x') res.lang = args[++i];
    else if (/^-(o|MF|MT|MQ|include|imacros|arch|target|Xclang)$/.test(a)) i++;
    else if (!a.startsWith('-') && C_EXT.test(a)) res.sources.push(abs(a));
  }
  return res;
}

/** compile_commands.json → [{ file, includeDirs, defines, std }] */
function readCompileCommands(file) {
  const list = JSON.parse(fs.readFileSync(file, 'utf8'));
  const out = [];
  for (const e of Array.isArray(list) ? list : []) {
    const argv = e.arguments || splitCommand(e.command || '');
    const p = parseCompilerArgs(argv, e.directory);
    const src = e.file ? path.resolve(e.directory || '.', e.file) : p.sources[0];
    if (src) out.push({ file: src, includeDirs: p.includeDirs, defines: p.defines, std: p.std, compiler: p.compiler });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Build capture: run the build with compiler shims first on PATH. Each shim
// appends its command line to a log and then runs the real compiler.

function shimScript(logFile, name) {
  const node = process.execPath;
  const js = path.join(path.dirname(logFile), 'shim.cjs');
  if (process.platform === 'win32') return { file: `${name}.cmd`, body: `@"${node}" "${js}" ${name} %*\r\n` };
  return { file: name, body: `#!/bin/sh\nexec "${node}" "${js}" ${name} "$@"\n` };
}

function writeShims(dir, logFile) {
  fs.mkdirSync(dir, { recursive: true });
  const shimJs = `'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const name = process.argv[2];
const args = process.argv.slice(3);
fs.appendFileSync(${JSON.stringify(logFile)}, JSON.stringify({ cwd: process.cwd(), argv: [name, ...args] }) + '\\n');
const shimDir = ${JSON.stringify(dir)};
const PATH = (process.env.PATH || process.env.Path || '').split(path.delimiter).filter((p) => path.resolve(p) !== path.resolve(shimDir)).join(path.delimiter);
const r = spawnSync(name, args, { stdio: 'inherit', env: { ...process.env, PATH, Path: PATH } });
process.exit(r.status == null ? 1 : r.status);
`;
  fs.writeFileSync(path.join(path.dirname(logFile), 'shim.cjs'), shimJs);
  for (const name of COMPILERS) {
    const s = shimScript(logFile, name);
    const f = path.join(dir, s.file);
    fs.writeFileSync(f, s.body);
    if (process.platform !== 'win32') fs.chmodSync(f, 0o755);
    // MSYS / Cygwin make and sh look for an extension-less script on Windows.
    else fs.writeFileSync(path.join(dir, name), `#!/bin/sh\nexec "${process.execPath.replace(/\\/g, '/')}" "${path.join(path.dirname(logFile), 'shim.cjs').replace(/\\/g, '/')}" ${name} "$@"\n`);
  }
}

/** Run `command` in `cwd` with shims; returns { status, units }. */
function runBuild(command, cwd, emitDir) {
  const shimDir = path.join(emitDir, 'shims');
  const logFile = path.join(emitDir, 'build-log.jsonl');
  fs.mkdirSync(emitDir, { recursive: true });
  fs.writeFileSync(logFile, '');
  writeShims(shimDir, logFile);
  const PATH = [shimDir, process.env.PATH || process.env.Path || ''].join(path.delimiter);
  const r = spawnSync(command, { cwd, shell: true, stdio: 'inherit', env: { ...process.env, PATH, Path: PATH, CC: 'cc', CXX: 'c++' } });
  return { status: r.status == null ? 1 : r.status, units: unitsFromLog(logFile) };
}

function unitsFromLog(logFile) {
  const out = [];
  if (!fs.existsSync(logFile)) return out;
  for (const line of fs.readFileSync(logFile, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    const p = parseCompilerArgs(rec.argv, rec.cwd);
    for (const src of p.sources) out.push({ file: src, includeDirs: p.includeDirs, defines: p.defines, std: p.std, compiler: p.compiler });
  }
  return out;
}

/** Merge per-unit flags into one engine option set (the engine takes one list). */
function mergeUnits(units) {
  const includeDirs = [];
  const defines = {};
  for (const u of units || []) {
    for (const d of u.includeDirs || []) if (!includeDirs.includes(d)) includeDirs.push(d);
    Object.assign(defines, u.defines || {});
  }
  return { includeDirs, defines };
}

// ---------------------------------------------------------------------------
// Analysis options

const STANDARD_PREFIX = {
  'misra-c2012': ['misra-c:'], 'misra-c2023': ['misra-c:'], 'misra-c': ['misra-c:'], 'misra-cpp2023': ['misra-cpp:'], 'misra-cpp': ['misra-cpp:'],
  'cert-c': ['cert:'], 'cert-cpp': ['cert:'], cert: ['cert:'], autosar: ['autosar:'], 'autosar-cpp14': ['autosar:'],
  'misra-c2004': ['misra-c2004:'], 'misra-cpp2008': ['misra-cpp2008:'], mois: ['kr-secure:'],
};
const STANDARD_ENGINES = ['misra-c:', 'misra-cpp:', 'cert:', 'autosar:', 'misra-c2004:', 'misra-cpp2008:'];

const AGGRESSIVENESS = {
  low: { k: 4, functionMs: 100, totalMs: 10000, allocNull: false },
  medium: { k: 8, functionMs: 200, totalMs: 15000, allocNull: false },
  high: { k: 16, functionMs: 600, totalMs: 60000, maxSteps: 120000, allocNull: true },
};

/**
 * cov-analyze flags → { inactive:Set, absint, filter(issue) }.
 * flags: { all, enable:[], disable:[], aggressiveness, codingStandards:[], security, webappSecurity, disableDefault }
 */
function analysisOptions(flags, catalog) {
  const inactive = new Set();
  const enable = (flags.enable || []).map(String);
  const disable = (flags.disable || []).map(String);
  const standards = new Set((flags.codingStandards || []).flatMap((s) => STANDARD_PREFIX[String(s).toLowerCase()] || []));
  const matches = (rule, name) => {
    const n = name.toUpperCase();
    return rule.key === name || rule.key.startsWith(name.endsWith(':') ? name : `${name}:`) || String(rule.checker || '').toUpperCase() === n;
  };
  for (const rule of catalog) {
    const stdEngine = STANDARD_ENGINES.find((p) => rule.key.startsWith(p));
    let on = true;
    if (stdEngine && !flags.all && !standards.has(stdEngine)) on = false;
    if (flags.disableDefault) on = false;
    if (flags.security === false && (rule.type === 'VULNERABILITY' || rule.type === 'SECURITY_HOTSPOT')) on = false;
    if (enable.some((e) => matches(rule, e))) on = true;
    if (disable.some((d) => matches(rule, d))) on = false;
    if (!on) inactive.add(rule.key);
  }
  const level = String(flags.aggressiveness || 'medium').toLowerCase();
  if (!AGGRESSIVENESS[level]) throw new Error(`Unknown aggressiveness level: ${flags.aggressiveness} (low, medium, high)`);
  const upper = (list) => list.map((x) => x.toUpperCase());
  const enabledCheckers = new Set(upper(enable));
  const disabledCheckers = new Set(upper(disable));
  const filter = (issue) => {
    const c = String(issue.checker || '').toUpperCase();
    if (disabledCheckers.has(c)) return false;
    if (flags.disableDefault && !enabledCheckers.has(c) && !enable.some((e) => issue.rule === e || String(issue.rule).startsWith(`${e}:`))) return false;
    if (level === 'low' && issue.severity === 'MINOR' && issue.type !== 'VULNERABILITY') return false;
    return true;
  };
  return { inactive, absint: AGGRESSIVENESS[level], filter, level };
}

// ---------------------------------------------------------------------------
// Coverity JSON v8 (cov-format-errors --json-output-v8)

function toJsonV8(analysis, opts = {}) {
  const strip = opts.stripPath ? String(opts.stripPath).replace(/\\/g, '/').replace(/\/?$/, '/') : '';
  const root = String(analysis.root || '').replace(/\\/g, '/');
  const full = (f) => (root ? `${root}/${f}` : f);
  const stripped = (f) => (strip && full(f).startsWith(strip) ? full(f).slice(strip.length) : f);
  const text = (m) => (m && typeof m === 'object' ? m.en || m.ko || '' : String(m || ''));
  const counts = new Map();
  const issues = [];
  for (const i of analysis.issues || []) {
    if (!i.checker) continue;
    const n = (counts.get(i.mergeKey) || 0) + 1;
    counts.set(i.mergeKey, n);
    const events = (i.events && i.events.length ? i.events : [{ line: i.line, tag: 'main', text: i.message, main: true }]).map((e, k) => ({
      covLStrEventDescription: text(e.text),
      eventDescription: text(e.text),
      eventNumber: k + 1,
      eventTreePosition: String(k + 1),
      eventSet: 0,
      eventTag: e.tag || 'event',
      filePathname: full(e.file || i.file),
      strippedFilePathname: stripped(e.file || i.file),
      lineNumber: e.line || i.line,
      main: !!e.main,
      moreInformationId: null,
      remediation: !!e.remediation,
      events: null,
    }));
    if (!events.some((e) => e.main)) events[events.length - 1].main = true;
    issues.push({
      mergeKey: i.mergeKey,
      occurrenceCountForMK: 1,
      occurrenceNumberInMK: n,
      referenceOccurrenceCountForMK: null,
      checkerName: i.checker,
      subcategory: i.kind ? String(i.kind).toLowerCase() : 'none',
      type: i.rule,
      subtype: i.rule,
      extra: i.function || '',
      domain: i.lang === 'c' || i.lang === 'cpp' ? 'STATIC_C' : i.lang === 'java' ? 'STATIC_JAVA' : i.lang === 'cs' ? 'STATIC_CS' : 'OTHER',
      language: i.lang || '',
      'code-language': i.lang || '',
      mainEventFilePathname: full(i.file),
      strippedMainEventFilePathname: stripped(i.file),
      mainEventLineNumber: i.line,
      properties: {},
      functionDisplayName: i.function || null,
      functionMangledName: i.function || null,
      localStatus: null,
      ordered: true,
      events,
      stateOnServer: i.cid ? {
        cid: i.cid,
        presentInReferenceSnapshot: !i.isNew,
        firstDetectedDateTime: i.createdAt || analysis.finishedAt,
        stream: (analysis.coverity && analysis.coverity.stream) || null,
        components: [i.component || 'Other'],
        componentOwners: i.componentOwner ? { [i.component]: i.componentOwner } : {},
        cached: false,
        retrievalDateTime: analysis.finishedAt,
        ownerLdapServerName: 'local',
        triage: {
          classification: i.classification || 'Unclassified',
          action: i.action || 'Undecided',
          fixTarget: 'Untargeted',
          severity: i.triageSeverity || 'Unspecified',
          legacy: i.legacy ? 'True' : 'False',
          owner: i.owner || 'Unassigned',
          externalReference: i.externalReference || '',
        },
        customTriage: {},
      } : null,
      checkerProperties: {
        category: i.category || '',
        categoryDescription: i.category || '',
        cweCategory: String(i.cwe || '').replace(/\D/g, ''),
        issueKinds: [i.type === 'VULNERABILITY' || i.type === 'SECURITY_HOTSPOT' ? 'SECURITY' : 'QUALITY'],
        eventSetCaptions: [],
        impact: i.impact || 'Medium',
        impactDescription: i.impact || 'Medium',
        subcategoryLocalEffect: text(i.message),
        subcategoryShortDescription: text(i.message),
        subcategoryLongDescription: text(i.message),
      },
    });
  }
  return { type: 'Coverity issues', formatVersion: 8, suppressedIssueCount: 0, issues, desktopAnalysisSettings: opts.desktop || null, error: null, warnings: [] };
}

// ---------------------------------------------------------------------------
// cov-make-library: C stubs using __coverity_*__ primitives → user models

const PRIMITIVES = [
  [/__coverity_alloc(_nosize)?__\s*\(/, 'allocator', null],
  [/__coverity_(free|delete|delete_array|close)__\s*\(/, 'free', null],
  [/__coverity_tainted_data_return__\s*\(|__coverity_tainted_data_argument__\s*\(/, 'source', 'TAINTED_SCALAR'],
  [/__coverity_tainted_data_sink__\s*\(|__coverity_tainted_string_sink_content__\s*\(/, 'sink', 'TAINTED_SCALAR'],
  [/__coverity_os_cmd_sink__\s*\(/, 'sink', 'OS_CMD_INJECTION'],
  [/__coverity_sql_sink__\s*\(/, 'sink', 'SQLI'],
  [/__coverity_format_string_sink__\s*\(/, 'sink', 'TAINTED_STRING'],
];

/** Parse model stubs. Returns { models, unsupported:[{name, primitive}] }. */
function makeLibrary(source) {
  const src = String(source).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, '');
  const models = [];
  const unsupported = [];
  const fnRe = /([A-Za-z_]\w*)\s*\(([^()]*)\)\s*\{/g;
  let m;
  while ((m = fnRe.exec(src))) {
    const name = m[1];
    if (/^(if|for|while|switch|return|sizeof)$/.test(name)) continue;
    let depth = 1;
    let j = fnRe.lastIndex;
    while (j < src.length && depth) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; j++; }
    const body = src.slice(fnRe.lastIndex, j - 1);
    fnRe.lastIndex = j;
    let found = false;
    for (const [re, kind, checker] of PRIMITIVES) {
      if (!re.test(body)) continue;
      found = true;
      models.push({ name, kind, pattern: `\\b${name}\\s*\\(`, langs: ['c', 'cpp'], ...(checker ? { checker } : {}), origin: 'cov-make-library' });
    }
    const other = /__coverity_(\w+)__\s*\(/.exec(body);
    if (!found && other) unsupported.push({ name, primitive: `__coverity_${other[1]}__` });
  }
  return { models, unsupported };
}

// ---------------------------------------------------------------------------
// Output helpers

function formatText(analysis, limit = 200) {
  const lines = [];
  const issues = (analysis.issues || []).filter((i) => i.checker).slice(0, limit);
  for (const i of issues) {
    const msg = i.message && typeof i.message === 'object' ? i.message.en : String(i.message || '');
    lines.push(`${i.file}:${i.line}: CID ${i.cid}: ${i.checker} (${i.impact})`);
    lines.push(`  ${msg}`);
    for (const e of (i.events || []).filter((x) => !x.main).slice(0, 8)) {
      lines.push(`  ${e.file || i.file}:${e.line}: ${e.tag}: ${e.text && typeof e.text === 'object' ? e.text.en : e.text || ''}`);
    }
  }
  return lines.join('\n');
}

module.exports = {
  splitCommand, parseCompilerArgs, readCompileCommands, runBuild, unitsFromLog, mergeUnits, writeShims,
  analysisOptions, AGGRESSIVENESS, toJsonV8, makeLibrary, formatText, COMPILERS,
};
