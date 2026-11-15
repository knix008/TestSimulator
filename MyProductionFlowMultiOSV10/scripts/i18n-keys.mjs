// Every UI text key the app uses — the literal t('…') keys in the sources plus the
// keys built from catalogs (block types, properties, options, distributions,
// samples, tutorial steps …). `node scripts/i18n-keys.mjs` lists the keys that
// Korean or English lacks; test/unit/i18n.test.js fails on any.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(path.join(root, p)).href);

export async function usedKeys() {
  const keys = new Set();
  const files = ['src/app.js', 'src/popups-sim.js', 'src/ui/panels.js', 'src/ui/startpage.js', 'src/ui/charts.js', 'src/editor/canvas2d.js', 'src/popup.js', 'src/ui/tutorial.js'];
  for (const f of files) {
    const text = fs.readFileSync(path.join(root, f), 'utf8');
    for (const m of text.matchAll(/\b(?:t|tt)\(\s*'([a-zA-Z0-9_.]+)'/g)) keys.add(m[1]);
    for (const m of text.matchAll(/label: '([a-zA-Z0-9_.]+\.[a-zA-Z0-9_.]+)'/g)) keys.add(m[1]);
    for (const m of text.matchAll(/'(notice\.[a-zA-Z]+|link\.[a-zA-Z]+|op\.[a-zA-Z]+|progress\.[a-zA-Z]+)'/g)) keys.add(m[1]);
  }
  const { BLOCK_TYPES, CATEGORIES, TIME_UNITS } = await imp('src/sim/blocks.js');
  const { DISTRIBUTIONS, DIST_KINDS } = await imp('src/sim/random.js');
  const { TEMPLATES } = await imp('src/sim/samples.js');
  for (const [type, spec] of Object.entries(BLOCK_TYPES)) {
    keys.add(`block.${type}`); keys.add(`block.${type}.desc`);
    for (const p of spec.props) {
      keys.add(`prop.${p.key}`); keys.add(`group.${p.group}`);
      if (p.hint) keys.add(`hint.${p.hint}`);
      if (p.type === 'select') for (const o of p.options) if (o !== '') keys.add(`opt.${p.key}.${o}`);
    }
  }
  for (const c of CATEGORIES) keys.add(`category.${c.id}`);
  for (const u of TIME_UNITS) keys.add(`unit.${u}`);
  for (const k of DIST_KINDS) keys.add(`distKind.${k}`);
  for (const params of Object.values(DISTRIBUTIONS)) for (const p of params) keys.add(`dist.${p}`);
  for (const [id] of TEMPLATES) { keys.add(`template.${id}`); keys.add(`template.${id}.desc`); }
  const tutorialText = fs.readFileSync(path.join(root, 'src/ui/tutorial.js'), 'utf8');
  for (const m of tutorialText.matchAll(/\{ id: '([a-zA-Z0-9]+)', chapter: '([a-z]+)'/g)) { keys.add(`tutorial.${m[1]}.title`); keys.add(`tutorial.${m[1]}.text`); keys.add(`tutorial.chapter.${m[2]}`); }
  const modelText = fs.readFileSync(path.join(root, 'src/sim/model.js'), 'utf8');
  for (const m of modelText.matchAll(/add\('(?:error|warning|info)', '([a-zA-Z]+)'/g)) keys.add(`check.${m[1]}`);
  for (const k of ['unknownName']) keys.add(`check.${k}`);
  for (const k of ['idle', 'running', 'paused', 'finished']) keys.add(`run.${k}`);
  for (const k of ['idle', 'busy', 'blocked', 'failed']) keys.add(`state.${k}`);
  for (const k of ['2d', '3d', 'split']) { keys.add(`view.short.${k}`); keys.add(`view.tool.${k}`); }
  for (const k of ['iso', 'top', 'front', 'side']) keys.add(`view3d.${k}`);
  for (const k of ['diagnosis', 'stats', 'charts', 'problems', 'log', 'experiments']) keys.add(`bottom.${k}`);
  // Diagnosis: problem ids (title + cause), fixes and evidence labels, read from sim/diagnose.js.
  const diag = fs.readFileSync(path.join(root, 'src/sim/diagnose.js'), 'utf8');
  for (const m of diag.matchAll(/\bid: '([a-zA-Z]+)'/g)) { keys.add(`diag.${m[1]}.title`); keys.add(`diag.${m[1]}.cause`); }
  for (const m of diag.matchAll(/\bkey: '([a-zA-Z]+)'/g)) keys.add(`fix.${m[1]}`);
  for (const m of diag.matchAll(/\[\['([a-zA-Z]+)', /g)) keys.add(`ev.${m[1]}`);
  for (const m of diag.matchAll(/, \['([a-zA-Z]+)', /g)) keys.add(`ev.${m[1]}`);
  for (const k of ['rate', 'timeout', 'contact', 'condition', 'neighbors', 'neighborsOutside']) { keys.add(`trKind.${k}`); keys.add(`trValue.${k}`); }
  for (const k of ['flow', 'influence']) keys.add(`linkKind.${k}`);
  for (const k of ['de', 'sd', 'abm']) keys.add(`paradigm.${k}`);
  for (const k of ['throughput', 'completed', 'cycleMean', 'wipMean', 'cost', 'lost']) keys.add(`metric.${k}`);
  for (const k of ['variation', 'montecarlo', 'optimize']) { keys.add(`exp.kind.${k}`); keys.add(`exp.kind.${k}.desc`); }
  for (const k of ['main', 'entity', 'resources', 'quality', 'failures', 'cost', 'statechart', 'placement', 'run', 'continuous', 'layout']) keys.add(`group.${k}`);
  for (const k of ['select', 'connect', 'pan']) { keys.add(`tool.${k}`); keys.add(`hint.${k}`); }
  for (const k of ['file', 'edit', 'view', 'model', 'simulation', 'help', 'home']) keys.add(`menu.${k}`);
  for (const k of ['exportTo', 'align', 'views3d', 'show', 'appearance', 'bottom', ...CATEGORIES.map((c) => `cat:${c.id}`)]) keys.add(`submenu.${k}`);
  for (const k of ['failure', 'repair', 'renege', 'warmup', 'error', 'sdLoop', 'maintenance', 'maintenanceDone']) keys.add(`log.${k}`);
  for (const k of ['statIn', 'statOut', 'statArrivals', 'statLost', 'statWaiting', 'statContentsMean', 'statContentsMax', 'statUtilization', 'statBlocked', 'statDown', 'statIdle', 'statProcessMean', 'statRejects', 'statFailures', 'statLengthMean', 'statLengthMax', 'statWaitMean', 'statWaitMax', 'statReneged', 'statCycleMean', 'statCycleSd', 'statCycleMax', 'statThroughput', 'statTransit', 'statCapacity', 'statFill', 'statDwell', 'statDistance', 'statFleet', 'statOpen', 'statBusyMean', 'statCost', 'statAgents', 'statTransitions']) keys.add(`stat.${k}`);
  for (const k of ['name', 'color', 'weight', 'start', 'end', 'value', 'rate', 'capacity', 'kind', 'state', 'now', 'trigger', 'radius']) keys.add(`col.${k}`);
  return keys;
}

export async function missingKeys() {
  const { DICTIONARIES } = await imp('src/i18n.js');
  const keys = await usedKeys();
  return {
    ko: [...keys].filter((k) => DICTIONARIES.ko[k] == null).sort(),
    en: [...keys].filter((k) => DICTIONARIES.en[k] == null && DICTIONARIES.ko[k] != null).sort(),
    enOnlyKo: [...keys].filter((k) => DICTIONARIES.en[k] == null).sort(),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const m = await missingKeys();
  console.log(`ko missing ${m.ko.length}:\n${m.ko.join('\n')}`);
  console.log(`\nen missing (ko present) ${m.en.length}:\n${m.en.join('\n')}`);
}
