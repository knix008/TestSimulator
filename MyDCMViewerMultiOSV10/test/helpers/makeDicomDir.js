/* Builds samples/dicomdir/: a small DICOMDIR file set (Explicit VR Little Endian copies of existing samples).
 *   node test/helpers/makeDicomDir.js        (re)writes the folder
 * The test suite calls buildDicomDirSet() to check the committed copy still resolves. */
const fs = require('fs');
const path = require('path');
const W = require('../../src/js/dicomWriter');

const SAMPLES = path.join(__dirname, '..', '..', 'samples');

// [source sample, File ID components inside the file set]
const SET = [
  ['CT_small.dcm', ['CT', 'IM0001']],
  ['MR_small.dcm', ['MR', 'IM0001']],
  ['pydicom-data/emri_small.dcm', ['EMRI', 'IM0001']],
  ['more/test-SR.dcm', ['SR', 'SR0001']],
];

async function buildDicomDirSet(outDir = path.join(SAMPLES, 'dicomdir')) {
  const files = [];
  for (const [src, id] of SET) {
    const bytes = new Uint8Array(fs.readFileSync(path.join(SAMPLES, src)));
    const model = W.parse(bytes);
    const hasPixels = model.elements.some((e) => e.tag === '7FE00010');
    const out = hasPixels ? await W.decompress(bytes) : W.write(model, { transferSyntax: '1.2.840.10008.1.2.1' });
    files.push({ path: id, bytes: out });
  }
  const dir = W.makeDicomDir(files, { fileSetId: 'MYDCMSAMPLE', sopInstanceUid: '2.25.188531120476541843206390418829413036431' });
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of files) {
    const p = path.join(outDir, ...f.path);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, f.bytes);
  }
  fs.writeFileSync(path.join(outDir, 'DICOMDIR'), dir);
  return { outDir, files: files.map((f) => f.path), dicomdir: dir };
}

module.exports = { buildDicomDirSet, SET };

if (require.main === module) {
  buildDicomDirSet().then((r) => console.log(`wrote ${r.outDir}: DICOMDIR + ${r.files.length} files`));
}
