// Discovers every *.test.mjs under test/ and runs them.
// Usage: node test/index.mjs [name-filter]
//
// Colour is automatic: on for a terminal, off when piped or when NO_COLOR is
// set. Force it back on with FORCE_COLOR=1.
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runAll, setSourceFile } from './helpers/runner.mjs';
import { c, pad, padStart, duration, bar } from './helpers/colors.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const RULE_WIDTH = 66;

function collect(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'helpers') continue;
      collect(full, out);
    } else if (name.endsWith('.test.mjs')) {
      out.push(full);
    }
  }
  return out;
}

/** `test/unit/model.test.mjs` reads better than an absolute path. */
function label(file) {
  return path.relative(here, file).replace(/\\/g, '/');
}

function rule(char = '─') {
  return c.grey(char.repeat(RULE_WIDTH));
}

const files = collect(here);
const filter = process.argv[2];

console.log('');
console.log(rule('═'));
console.log(
  `  ${c.bold(c.cyan('DBTools'))} ${c.grey('·')} ${c.bold('test suite')}` +
    (filter ? `   ${c.onYellow(` filter: ${filter} `)}` : ''),
);
console.log(
  c.grey(
    `  ${files.length} file${files.length === 1 ? '' : 's'} · node ${process.version} · ${process.platform}`,
  ),
);
console.log(rule('═'));

for (const file of files) {
  setSourceFile(label(file));
  await import(pathToFileURL(file).href);
}
setSourceFile(null);

const result = await runAll({ filter });
const { passed, failed, failures, suites, durationMs } = result;
const total = passed + failed;
const suitesFailed = suites.filter((s) => s.failed > 0).length;

console.log('');
console.log(rule());

if (total === 0) {
  console.log(`  ${c.onYellow(' EMPTY ')} ${c.yellow('no tests matched')}`);
  console.log(rule());
  console.log('');
  process.exit(1);
}

// Ratio bar — green as far as the tests passed, red for the remainder.
const ratio = passed / total;
const { filled, empty } = bar(ratio, 34);
const percent = `${Math.floor(ratio * 100)}%`;
console.log(
  `  ${c.green(filled)}${c.red(empty)}  ${failed === 0 ? c.green(c.bold(percent)) : c.red(c.bold(percent))}`,
);
console.log('');

function row(name, good, bad, totalCount) {
  const parts = [c.green(`${good} passed`)];
  if (bad > 0) parts.push(c.red(`${bad} failed`));
  console.log(
    `  ${c.bold(pad(name, 9))}${pad(parts.join(c.grey(' · ')), 34)}${padStart(c.grey(`${totalCount} total`), 12)}`,
  );
}

row('Suites', suites.length - suitesFailed, suitesFailed, suites.length);
row('Tests', passed, failed, total);
console.log(`  ${c.bold(pad('Files', 9))}${c.grey(`${result.files.size} of ${files.length} contributed suites`)}`);
console.log(`  ${c.bold(pad('Time', 9))}${c.grey(duration(durationMs))}`);
if (result.skippedSuites > 0) {
  console.log(
    `  ${c.bold(pad('Filtered', 9))}${c.yellow(`${result.skippedSuites} suites skipped by "${filter}"`)}`,
  );
}

// Worth surfacing only when the run is slow enough that someone would care.
const slowest = [...suites].sort((a, b) => b.durationMs - a.durationMs).slice(0, 3);
if (durationMs >= 1000 && slowest[0]?.durationMs >= 100) {
  console.log('');
  console.log(`  ${c.bold('Slowest')}`);
  for (const s of slowest) {
    console.log(`    ${c.grey('·')} ${pad(c.grey(s.name), 48)}${padStart(c.yellow(duration(s.durationMs)), 8)}`);
  }
}

if (failures.length > 0) {
  console.log('');
  console.log(`  ${c.red(c.bold(`Failed test${failures.length === 1 ? '' : 's'}`))}`);
  failures.forEach((f, i) => {
    const number = c.grey(`${String(i + 1).padStart(2)})`);
    console.log('');
    console.log(`  ${number} ${c.red(c.bold(f.test))}`);
    console.log(`      ${c.grey(`${f.file ?? '?'} › ${f.suite}`)}`);
    for (const line of String(f.detail).split('\n')) console.log(`      ${c.red(line)}`);
  });
}

console.log('');
console.log(rule());
console.log(
  failed === 0
    ? `  ${c.onGreen(' PASS ')} ${c.green(c.bold(`all ${total} tests passed`))} ${c.grey(`in ${duration(durationMs)}`)}`
    : `  ${c.onRed(' FAIL ')} ${c.red(c.bold(`${failed} of ${total} tests failed`))} ${c.grey(`in ${duration(durationMs)}`)}`,
);
console.log(rule());
console.log('');

process.exit(failed > 0 ? 1 : 0);
