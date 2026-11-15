// npm run samples — writes every sample model to samples/<id>.mpf (Korean names)
// and samples/en/<id>.mpf (English names). They are built from src/sim/samples.js,
// so they always match the block catalog; the installer ships them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { SAMPLE_PROJECTS, buildSample } = await import(pathToFileURL(path.join(root, 'src/sim/samples.js')).href);
const { serializeModel, checkModel } = await import(pathToFileURL(path.join(root, 'src/sim/model.js')).href);

const dir = path.join(root, 'samples');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(path.join(dir, 'en'), { recursive: true });
let n = 0;
for (const s of SAMPLE_PROJECTS) {
  for (const [lang, sub] of [['ko', ''], ['en', 'en']]) {
    const m = buildSample(s.id);
    m.name = s[lang][0];
    m.description = s[lang][1];
    const errors = checkModel(m).filter((p) => p.severity === 'error');
    if (errors.length) throw new Error(`${s.id}: ${JSON.stringify(errors)}`);
    fs.writeFileSync(path.join(dir, sub, `${String(SAMPLE_PROJECTS.indexOf(s) + 1).padStart(2, '0')}-${s.id}.mpf`), serializeModel(m));
    n += 1;
  }
}
console.log(`samples/: ${n} files (${SAMPLE_PROJECTS.length} models × ko/en)`);
