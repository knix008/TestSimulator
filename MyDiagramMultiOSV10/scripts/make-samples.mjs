// npm run samples — writes the sample drawings installed with the app into samples/:
// the drawings of samples.js in Korean and English (.mdg), a Visio copy of the
// online shop (.vsdx), and a brainstorming template (.mdgt).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serialize } from '../src/domain/format.js';
import { SAMPLE_FILES } from '../src/domain/samples.js';
import { buildTemplate } from '../src/domain/templates.js';
import { exportVsdx } from '../src/domain/interop.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'samples');

/** The files written: [file name, () => text or bytes]. */
function sampleFiles() {
  const files = [];
  for (const language of ['ko', 'en']) {
    for (const [name, build] of Object.entries(SAMPLE_FILES)) files.push([`${name}.${language}.mdg`, () => serialize(build(language))]);
    files.push([`online-shop.${language}.vsdx`, () => exportVsdx(SAMPLE_FILES['online-shop'](language), { now: new Date('2026-10-17T09:00:00Z') })]);
    files.push([`brainstorm-template.${language}.mdgt`, () => serialize(buildTemplate('mindmap', { language }), { template: true })]);
  }
  return files;
}

fs.mkdirSync(dir, { recursive: true });
// Stale samples go first; files not named <stem>.<ko|en>.<ext> are not generated here and stay.
for (const name of fs.readdirSync(dir)) {
  if (/\.(ko|en)\.(mdg|mdgt|vsdx)$/i.test(name)) fs.rmSync(path.join(dir, name));
}
for (const [name, make] of sampleFiles()) {
  const content = make();
  fs.writeFileSync(path.join(dir, name), content);
  console.log(`samples/${name}  ${((typeof content === 'string' ? Buffer.byteLength(content) : content.length) / 1024).toFixed(1)} KB`);
}
