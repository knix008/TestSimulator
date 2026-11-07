// npm run coverage — how much of the feature checklist (src/core/features.js) is implemented, by area.
//   npm run coverage -- --planned   also lists everything that is still missing
import { FEATURES, coverage } from '../src/core/features.js';
import { c, heading, padEnd, padStart } from '../test/e2e/report.mjs';

const result = coverage();
console.log(heading('Feature coverage'));
console.log(`  ${c.bold(padEnd('Area', 22))}${c.bold(padStart('Done', 7))}${c.bold(padStart('Partial', 9))}${c.bold(padStart('Planned', 9))}${c.bold(padStart('Total', 7))}`);
for (const a of result.areas) {
  console.log(`  ${padEnd(a.area, 22)}${c.green(padStart(String(a.done), 7))}${c.yellow(padStart(String(a.partial), 9))}${c.dim(padStart(String(a.planned), 9))}${padStart(String(a.total), 7)}`);
}
console.log(`  ${c.bold(padEnd('All', 22))}${c.bold(c.green(padStart(String(result.done), 7)))}${c.bold(c.yellow(padStart(String(result.partial), 9)))}${c.dim(padStart(String(result.planned), 9))}${c.bold(padStart(String(result.total), 7))}`);
console.log(`\n  ${c.bold(`${result.percent}%`)} of the checklist (a partial feature counts as half).`);
if (process.argv.includes('--planned')) {
  console.log(`\n${heading('Still planned')}`);
  for (const f of FEATURES.filter((x) => x.status === 'planned')) console.log(`  ${c.dim(padEnd(f.area, 18))} ${f.en}`);
  console.log(`\n${heading('Partial')}`);
  for (const f of FEATURES.filter((x) => x.status === 'partial')) console.log(`  ${c.dim(padEnd(f.area, 18))} ${f.en}${f.note ? c.dim(` — ${f.note}`) : ''}`);
}
