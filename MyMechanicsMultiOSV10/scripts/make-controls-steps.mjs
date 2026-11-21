// Writes test/e2e/controls.steps.json — the E2E test that every control has its effect — from the step
// sources in test/e2e/controls/*.js:
//   node scripts/make-controls-steps.mjs                    (uses test/e2e/controls/commands.json)
//   node scripts/make-controls-steps.mjs --refresh-commands (asks the app in headless Edge for its commands first)
//
// A source file holds steps separated by lines "//@step {json}" (name, expect …); the code after it is the
// step's eval. Expanded here:
//   *.each.js       — once per feature type (FEATURE_TYPES), __TYPE__ replaced by the type;
//   __KNOWN_TYPES__ — the feature types known now (a later step covers the ones added after);
//   "//@generate commands" — one step per command per context (part, assembly, drawing) from commands.json,
//                    and one step per context for commands registered later.
// The steps are registry-driven at run time too, so a feature or command added later is still covered.
import { readFileSync, writeFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'test/e2e/controls');
const commandsFile = path.join(dir, 'commands.json');

if (process.argv.includes('--refresh-commands')) {
  const tmp = mkdtempSync(path.join(tmpdir(), 'mm-controls-'));
  const steps = path.join(tmp, 'commands.steps.json');
  writeFileSync(steps, JSON.stringify([{ eval: 'JSON.stringify(Object.keys(window.__mymechanics.commands))' }]));
  const run = spawnSync(process.execPath, [path.join(root, 'scripts/smoke-web.mjs'), '--out', tmp, '--steps', steps], { cwd: root, encoding: 'utf8' });
  const line = run.stdout.split(/\r?\n/).find((l) => l.includes('→ ['));
  if (!line) { console.error(run.stdout, run.stderr); process.exit(1); }
  writeFileSync(commandsFile, `${JSON.stringify(JSON.parse(line.slice(line.indexOf('→ [') + 2)), null, 0)}\n`);
}

const { FEATURE_TYPES } = await import(pathToFileURL(path.join(root, 'src/cad/features.js')).href);
const commands = JSON.parse(readFileSync(commandsFile, 'utf8'));

const parse = (src) => {
  const out = [];
  for (const p of src.split(/^\/\/@step /m)) {
    if (!p.trim()) continue;
    const nl = p.indexOf('\n');
    if (!p.trimStart().startsWith('{')) continue; // the file's own comment before the first step
    out.push({ ...JSON.parse(p.slice(0, nl)), eval: p.slice(nl + 1).trim() });
  }
  return out;
};

function commandSteps() {
  const out = [];
  for (const ctx of ['part', 'assembly', 'drawing']) {
    for (const id of commands) out.push({ name: `cmd: ${ctx} · ${id} — has a visible effect (or is skipped with its reason / not available here)`, expect: '^(ok|n/a)', eval: `window.__cmdOne('${ctx}', '${id}')` });
    out.push({ name: `cmd: ${ctx} · commands added later — each has a visible effect`, expect: '^ok', eval: `window.__cmdLater('${ctx}', ${JSON.stringify(commands)})` });
  }
  return out;
}

const steps = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) {
  let src = readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n');
  if (f.endsWith('.each.js')) { for (const t of FEATURE_TYPES) steps.push(...parse(src.replaceAll('__TYPE__', t))); continue; }
  src = src.replaceAll('__KNOWN_TYPES__', JSON.stringify(FEATURE_TYPES));
  const [before, after] = src.split(/^\/\/@generate commands\s*$/m);
  steps.push(...parse(before));
  if (after !== undefined) { steps.push(...commandSteps()); steps.push(...parse(after)); }
}
const out = path.join(root, 'test/e2e/controls.steps.json');
writeFileSync(out, `${JSON.stringify(steps, null, 2)}\n`);
console.log(`${steps.length} steps (${FEATURE_TYPES.length} feature types, ${commands.length} commands) → ${path.relative(root, out)}`);
