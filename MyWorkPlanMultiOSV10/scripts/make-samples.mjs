// npm run samples — writes the sample plans installed with the app into samples/:
// the tutorial plan and three templates in Korean and English (.mwp), and the
// event template as a reusable template file (.mwpt).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serialize } from '../src/domain/format.js';
import { schedule } from '../src/domain/schedule.js';
import { buildSample, buildTemplate } from '../src/domain/templates.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'samples');

/** The files written: [file name, () => text]. */
function sampleFiles() {
  const files = [];
  for (const language of ['ko', 'en']) {
    const plan = (name, project) => files.push([`${name}.${language}.mwp`, () => serialize(project, { sched: schedule(project) })]);
    plan('website-redesign', buildSample(language));
    plan('software-project', buildTemplate('software', { language }));
    plan('construction-project', buildTemplate('construction', { language }));
    plan('event-plan', buildTemplate('event', { language }));
    files.push([`event-template.${language}.mwpt`, () => serialize(buildTemplate('event', { language }), { template: true })]);
  }
  return files;
}

fs.mkdirSync(dir, { recursive: true });
// Stale plans go first; other files in samples/ stay.
for (const name of fs.readdirSync(dir)) {
  if (/\.(mwp|mwpt)$/i.test(name)) fs.rmSync(path.join(dir, name));
}
for (const [name, make] of sampleFiles()) {
  const text = make();
  fs.writeFileSync(path.join(dir, name), text, 'utf8');
  console.log(`samples/${name}  ${(Buffer.byteLength(text) / 1024).toFixed(1)} KB`);
}
