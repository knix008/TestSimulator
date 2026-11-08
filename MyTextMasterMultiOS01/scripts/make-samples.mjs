// npm run samples — writes the start page's sample documents (src/domain/samples.js) to samples/,
// which the installer ships and test/app-data.test.mjs compares with the list.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAMPLES } from '../src/domain/samples.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'samples');
fs.mkdirSync(dir, { recursive: true });
const wanted = new Set(SAMPLES.map((sample) => sample.file));
for (const file of fs.readdirSync(dir)) if (!wanted.has(file)) fs.rmSync(path.join(dir, file));
for (const sample of SAMPLES) fs.writeFileSync(path.join(dir, sample.file), sample.text);
console.log(`samples/ — ${SAMPLES.length}개 예제 문서를 썼습니다.`);
