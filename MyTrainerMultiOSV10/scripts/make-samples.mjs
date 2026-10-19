// Writes the files in samples/: a few sample projects as .mytrain files (Korean and English names)
// and two CSV tables for trying "Import CSV" — a classification table (did a student pass?) and a
// regression table (house prices). Everything is generated from a fixed seed.
//   npm run samples
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { houseCsv, studentCsv } from '../src/domain/tables.js';
import { serializeProject } from '../src/domain/project.js';
import { sampleProject } from '../src/domain/samples.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'samples');
fs.mkdirSync(dir, { recursive: true });

for (const [id, file] of [['xor', 'xor'], ['spiral', 'spiral'], ['digitsCnn', 'digits-cnn'], ['lstmForecast', 'lstm-forecast'], ['sentiment', 'sentiment'], ['residual', 'residual'], ['speechCnn', 'speech-cnn'], ['objectsCnn', 'objects-cnn'], ['hangulOcr', 'hangul-ocr'], ['videoLstm', 'video-lstm']]) {
  for (const language of ['ko', 'en']) {
    fs.writeFileSync(path.join(dir, `${file}.${language}.mytrain`), serializeProject(sampleProject(id, language)));
  }
}

fs.writeFileSync(path.join(dir, 'student-pass.csv'), studentCsv());
fs.writeFileSync(path.join(dir, 'house-prices.csv'), houseCsv());
console.log(`samples/: ${fs.readdirSync(dir).length} files`);
