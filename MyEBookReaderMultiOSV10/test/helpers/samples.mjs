// Loads the generated sample books for the tests.
//
// They are produced by scripts/make-samples.mjs (run by `pretest`), so the
// format readers are exercised against real files rather than fixtures written
// to match the reader's own assumptions.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SAMPLES_DIR = path.join(here, '..', '..', 'samples');

export function samplePath(name) {
  return path.join(SAMPLES_DIR, name);
}

export function sampleBytes(name) {
  return new Uint8Array(fs.readFileSync(samplePath(name)));
}

export function sampleText(name) {
  return fs.readFileSync(samplePath(name), 'utf-8');
}

export function hasSample(name) {
  return fs.existsSync(samplePath(name));
}

export const SAMPLE_NAMES = [
  'sample.epub', 'sample.cbz', 'sample.fb2', 'sample.txt',
  'sample.md', 'sample.html', 'sample.mobi', 'sample.pdf',
  'sample.png', 'sample.tif', 'sample.dcm',
];
