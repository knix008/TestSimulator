// npm run samples — writes the start page's furnished samples as .msk files into samples/
// (<id>.ko.msk and <id>.en.msk), so users can open them from File › Open; the installer ships them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSampleProject, SAMPLE_PROJECTS } from '../src/engine/samples.js';
import { packProject } from '../src/engine/fileformat.js';
import { normalizeProject } from '../src/engine/document.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'samples');
fs.mkdirSync(dir, { recursive: true });
for (const name of fs.readdirSync(dir)) if (/\.msk$/i.test(name)) fs.rmSync(path.join(dir, name));
let count = 0;
for (const sample of SAMPLE_PROJECTS) {
  for (const language of ['ko', 'en']) {
    const project = normalizeProject(buildSampleProject(sample.id, language));
    fs.writeFileSync(path.join(dir, `${sample.id}.${language}.msk`), packProject(project));
    count += 1;
  }
}
console.log(`samples/: ${count} files`);
