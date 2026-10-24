// npm run samples — writes every sample model to samples/<id>.myheat (Korean
// names) and samples/en/<id>.myheat (English), plus a node-data CSV for the
// heat-map tool. The installer ships the folder (tauri.conf.json resources).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAMPLE_IDS, sampleModel } from '../src/core/samples.js';
import { serializeModel } from '../src/core/model.js';
import { sampleNodeCsv } from '../src/core/heatmap.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'samples');
fs.mkdirSync(path.join(dir, 'en'), { recursive: true });
for (const id of SAMPLE_IDS) {
  fs.writeFileSync(path.join(dir, `${id}.myheat`), serializeModel(sampleModel(id, 'ko')));
  fs.writeFileSync(path.join(dir, 'en', `${id}.myheat`), serializeModel(sampleModel(id, 'en')));
}
fs.writeFileSync(path.join(dir, 'radiator-nodes.csv'), sampleNodeCsv());
console.log(`samples/: ${SAMPLE_IDS.length} models × 2 languages + radiator-nodes.csv`);
