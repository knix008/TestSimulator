// npm run samples — writes the sample projects installed with the app into samples/:
// the 40 projects of the start page in Korean and English (.myuml), a StarUML copy of
// the Online Shop (.mdj), a model fragment (.mfj, its domain package), and the class-model
// template (.mumlt). The StarUML sample of the interop tests (staruml-sample.mdj) stays.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serialize } from '../src/domain/format.js';
import { buildTemplate } from '../src/domain/templates.js';
import { SAMPLE_PROJECTS, sampleFileName } from '../src/domain/samples/index.js';
import { exportFragment, exportMdj } from '../src/domain/interop/staruml.js';
import { elementsWhere } from '../src/domain/model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'samples');

/** The files written: [file name, () => text]. */
function sampleFiles() {
  const files = SAMPLE_PROJECTS.flatMap((sample) => ['ko', 'en'].map((language) => [sampleFileName(sample.id, language), () => serialize(sample.build(language))]));
  for (const language of ['ko', 'en']) {
    const sample = () => SAMPLE_PROJECTS[0].build(language);
    files.push([`online-shop.${language}.mdj`, () => exportMdj(sample())]);
    files.push([`shop-domain.${language}.mfj`, () => exportFragment(elementsWhere(sample(), (e) => e._type === 'UMLPackage' && e.name === 'domain')[0])]);
    files.push([`class-model.${language}.mumlt`, () => serialize(buildTemplate('classModel', { language }), { template: true })]);
  }
  return files;
}

fs.mkdirSync(dir, { recursive: true });
// Stale samples go first; other files in samples/ stay.
for (const name of fs.readdirSync(dir)) {
  if (/\.(myuml|mumlt|mfj)$/i.test(name) || /^online-shop\..*\.mdj$/i.test(name)) fs.rmSync(path.join(dir, name));
}
for (const [name, make] of sampleFiles()) {
  const content = make();
  fs.writeFileSync(path.join(dir, name), content);
  console.log(`samples/${name}  ${(Buffer.byteLength(content) / 1024).toFixed(1)} KB`);
}
