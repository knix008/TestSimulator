import { deepEq, eq, ok } from '../assert.js';
import {
  archiveStem, createOptions, errorKey, fileExtension, fileIconFor, FORMAT_NAMES, FORMATS, formatDate, formatSize, looksLikeArchive, parseSize, ratioText,
  splitBytes, SPLIT_PRESETS, suggestName, validateCreate, withFormatExt, deleteSourcesProblem } from '../../src/lib/format.js';

import { SIZE_STEP, stepValue } from '../../src/components/Stepper.jsx';
import { defaultLayout, fitLayout, GAP, MIN_H, MIN_W, movedBy, resizedBy, settleMove, settleResize } from '../../src/lib/startLayout.js';

export const title = 'Sizes, names and option rules';

const form = (p) => ({
  format: 'zip', sources: [{ path: '/a', isDir: false }], output: '/o/a.zip', password: '', confirm: '', split: 'none', splitText: '100', splitUnit: 'MB', level: 5, zipStyle: 'span', ...p,
});

export default async function (test) {
  await test('parseSize: units and decimals', () => {
    eq(parseSize('100', 'MB'), 104857600);
    eq(parseSize('1', 'KB'), 1024);
    eq(parseSize('1.5 GB'), 1610612736);
    eq(parseSize('700m'), 734003200);
    eq(parseSize('4,092 MB'), 4290772992);
    eq(parseSize('512 b'), 512);
    eq(parseSize('2gib'), 2147483648);
    eq(parseSize('10', 'B'), 10);
  });
  await test('parseSize: invalid values give null', () => {
    for (const bad of ['', 'abc', '-5', '0', '1.2.3', '5 XB', null, undefined]) eq(parseSize(bad), null, String(bad));
  });
  await test('formatSize', () => {
    eq(formatSize(0), '0 B');
    eq(formatSize(1023), '1023 B');
    eq(formatSize(1024), '1.00 KB');
    eq(formatSize(1536), '1.50 KB');
    eq(formatSize(1048576), '1.00 MB');
    eq(formatSize(5 * 1024 ** 3), '5.00 GB');
    eq(formatSize(null), '—');
  });
  await test('formatDate, ratioText', () => {
    ok(/^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(formatDate(1600000000)));
    eq(formatDate(null), '');
    eq(ratioText(100, 25), '25%');
    eq(ratioText(0, 0), '');
    eq(ratioText(100, null), '');
  });
  await test('split presets: media capacities are exact', () => {
    const p = Object.fromEntries(SPLIT_PRESETS.map((x) => [x.id, x.bytes]));
    eq(p['1.44mb'], 1457664);
    eq(p['650mb'], 681574400);
    eq(p['700mb'], 734003200);
    eq(p['4092mb'], 4290772992, 'FAT32 limit');
    eq(p.dvd, 4700372992);
    eq(p['dvd-dl'], 8543666176);
    eq(p.bd, 25025314816);
    eq(new Set(SPLIT_PRESETS.map((x) => x.id)).size, SPLIT_PRESETS.length);
  });
  await test('archiveStem: same name from any part', () => {
    eq(archiveStem('report.zip'), 'report');
    eq(archiveStem('a.tar.gz'), 'a');
    eq(archiveStem('a.tgz'), 'a');
    eq(archiveStem('set.7z.003'), 'set');
    eq(archiveStem('x.part02.rar'), 'x');
    eq(archiveStem('x.z03'), 'x');
    eq(archiveStem('x.r00'), 'x');
    eq(archiveStem('noext'), 'noext');
  });
  await test('withFormatExt: the extension follows the format', () => {
    eq(withFormatExt('C:\\a b\\x.zip', '7z'), 'C:\\a b\\x.7z');
    eq(withFormatExt('/o/x.7z', 'tar.gz'), '/o/x.tar.gz');
    eq(withFormatExt('/o/x.tar.gz', 'zip'), '/o/x.zip');
    eq(withFormatExt('/o/x.zip', 'zip', true, true), '/o/x.exe');
    eq(withFormatExt('/o/x.exe', 'zip', false), '/o/x.zip');
    eq(withFormatExt('/o/x.zip', 'zip', true, false), '/o/x');
  });
  await test('looksLikeArchive, fileExtension, suggestName', () => {
    for (const n of ['a.zip', 'a.7z', 'a.RAR', 'a.tar.gz', 'a.tgz', 'a.z01', 'a.r00', 'a.001', 'a.iso', 'a.cab', 'a.zst']) ok(looksLikeArchive(n), n);
    for (const n of ['a.txt', 'a.exe', 'a.docx', 'noext']) ok(!looksLikeArchive(n), n);
    eq(fileExtension('A.TAR.GZ'), 'tar.gz');
    eq(fileExtension('.hidden'), '');
    eq(suggestName(['photo.png']), 'photo');
    eq(suggestName(['folder']), 'folder');
    eq(suggestName(['a', 'b']), 'archive');
  });
  await test('fileIconFor: icon name per format', () => {
    const cases = { 'a.zip': 'zip', 'a.z01': 'zip', 'a.7z': '7z', 'a.rar': 'rar', 'a.r00': 'rar', 'a.tar': 'tar', 'a.gz': 'gz', 'a.tgz': 'gz', 'a.bz2': 'bz2', 'a.xz': 'xz', 'a.zst': 'zst', 'a.cab': 'cab', 'a.iso': 'iso', 'a.7z.001': 'part' };
    for (const [n, want] of Object.entries(cases)) eq(fileIconFor(n), want, n);
    eq(fileIconFor('a.txt'), null);
    eq(fileIconFor('noext'), null);
  });
  await test('validateCreate: reports problems, null when fine', () => {
    eq(validateCreate(form()), null);
    eq(validateCreate(form({ format: 'nope' })), 'create.errFormat');
    eq(validateCreate(form({ sources: [] })), 'create.errNoSources');
    eq(validateCreate(form({ output: '  ' })), 'create.errNoOutput');
    eq(validateCreate(form({ password: 'a', confirm: 'b' })), 'create.errPasswordMatch');
    eq(validateCreate(form({ password: 'a', confirm: 'a' })), null);
    eq(validateCreate(form({ format: 'gz', sources: [{ path: '/a', isDir: true }] })), 'create.errSingle');
    eq(validateCreate(form({ format: 'gz', sources: [{ path: '/a' }, { path: '/b' }] })), 'create.errSingle');
    eq(validateCreate(form({ format: 'gz' })), null);
    eq(validateCreate(form({ split: 'custom', splitText: 'x' })), 'create.errSplitSize');
    eq(validateCreate(form({ split: 'custom', splitText: '10', splitUnit: 'KB' })), 'create.errZipSplitMin');
    eq(validateCreate(form({ split: 'custom', splitText: '10', splitUnit: 'KB', zipStyle: 'numbered' })), null);
    eq(validateCreate(form({ format: '7z', split: 'custom', splitText: '100', splitUnit: 'B' })), 'create.errSplitMin');
    eq(validateCreate(form({ sfx: true, split: '10mb' })), 'create.errSfxSplit');
    eq(validateCreate(form({ convert: true, sources: [] })), null);
  });
  await test('splitBytes', () => {
    eq(splitBytes(form()), null);
    eq(splitBytes(form({ split: '100mb' })), 104857600);
    eq(splitBytes(form({ split: 'custom', splitText: '1.5', splitUnit: 'GB' })), 1610612736);
  });
  await test('createOptions: only options the format has reach the engine', () => {
    let o = createOptions(form({ method: 'lzma', password: 'p', confirm: 'p', cipher: 'aes128', split: '10mb', comment: 'c', solid: true, encryptNames: true }));
    eq(o.method, 'lzma');
    eq(o.encryption, 'aes128');
    eq(o.volumeSize, 10485760);
    eq(o.zipSplitStyle, 'span');
    eq(o.comment, 'c');
    eq(o.solid, undefined, 'ZIP has no solid mode');
    eq(o.encryptNames, undefined, 'ZIP cannot hide names');
    o = createOptions(form({ format: '7z', password: 'p', confirm: 'p', solid: true, encryptNames: true, comment: 'c', recovery: 5 }));
    eq(o.solid, true);
    eq(o.encryptNames, true);
    eq(o.encryption, undefined);
    eq(o.comment, undefined, '7z has no comment');
    eq(o.recoveryPercent, undefined);
    o = createOptions(form({ format: 'rar', recovery: '5', rarVersion: 'rar4' }));
    eq(o.recoveryPercent, 5);
    eq(o.rarVersion, 'rar4');
    eq(o.method, undefined);
    o = createOptions(form({ format: 'tar', password: 'x', confirm: 'x', level: 9 }));
    eq(o.password, undefined, 'tar has no password');
    eq(o.level, 6, 'tar has no level');
    deepEq(createOptions(form({ exclude: '*.tmp; node_modules\n*.log' })).exclude, ['*.tmp', 'node_modules', '*.log']);
    eq(createOptions(form({ sfx: true })).sfx, true);
    eq(createOptions(form({ format: '7z', sfx: true })).sfx, undefined);
  });
  await test('stepper: lands on multiples of its step, stays in range', () => {
    eq(stepValue('100', 1, 10), 110);
    eq(stepValue('100', -1, 10), 90);
    eq(stepValue('105', 1, 10), 110);
    eq(stepValue('105', -1, 10), 100);
    eq(stepValue('10', -1, 10, 1), 1, 'floor');
    eq(stepValue('1', 1, 10, 1), 10, 'from the floor to the first step');
    eq(stepValue('300', 1, 10, 0, 300), 300, 'ceiling');
    eq(stepValue('abc', 1, 5, 0), 5, 'text starts from the floor');
    eq(SIZE_STEP.MB, 10, 'ten megabytes at a time');
  });

  await test('originals may go only when everything in them is in the archive, and the archive is not in them', () => {
    const form = (p) => ({ output: 'C:/out/a.zip', exclude: '', sources: [{ path: 'C:/src/f.txt' }], ...p });
    eq(deleteSourcesProblem(form()), null);
    eq(deleteSourcesProblem(form({ exclude: '*.tmp' })), 'create.deleteNoExclude');
    eq(deleteSourcesProblem(form({ sources: [{ path: 'C:\\OUT' }] })), 'create.deleteInside', 'folder holding the archive, any case and slash');
    eq(deleteSourcesProblem(form({ sources: [{ path: 'C:/out/a.zip' }] })), 'create.deleteInside', 'the archive itself');
    eq(deleteSourcesProblem(form({ sources: [{ path: 'C:/ou' }] })), null, 'a name that only begins alike');
  });
  await test('start cards: side by side, kept on the board, never left overlapping', () => {
    const d = defaultLayout(1000, 400);
    eq(d.main.x, 0);
    eq(d.background.x, d.main.w + GAP);
    eq(d.background.x + d.background.w, 1000);
    eq(defaultLayout(500, 400).background.y > 0, true, 'stacked when narrow');
    eq(fitLayout({ main: { x: 'a' } }, 800, 400).main.w, defaultLayout(800, 400).main.w, 'nonsense is ignored');
    // Resized: the other card takes what is left.
    const narrower = settleResize({ ...d, main: resizedBy(d.main, -200, -100) }, 'main', 1000);
    eq(narrower.background.x, narrower.main.w + GAP);
    eq(narrower.background.x + narrower.background.w, 1000);
    eq(narrower.main.w % 8, 0, 'lands on the grid');
    eq(narrower.main.h, d.main.h - 100 - ((d.main.h - 100) % 8) + ((d.main.h - 100) % 8 >= 4 ? 8 : 0));
    eq(settleResize({ ...d, main: { ...d.main, w: 5000 } }, 'main', 1000).background.w, MIN_W, 'it never takes all the room');
    eq(resizedBy(d.main, -5000, -5000).w, MIN_W);
    eq(resizedBy(d.main, -5000, -5000).h, MIN_H);
    // Moved across: they change sides, with no hole.
    const swapped = settleMove({ ...d, main: movedBy(d.main, 800, 10) }, 'main', 1000);
    eq(swapped.background.x, 0);
    eq(swapped.main.x, swapped.background.w + GAP);
    eq(swapped.main.x + swapped.main.w, 1000);
    eq(swapped.main.y, 0, 'back to the top');
    // Moved a little: back in place.
    const same = settleMove({ ...d, main: movedBy(d.main, 3, 5) }, 'main', 1000);
    eq(same.main.x, 0);
    eq(same.main.y, 0);
    // Moved below the other: stacked at full width.
    const tall = { main: { ...d.main, h: 200 }, background: { ...d.background, h: 200 } };
    const below = settleMove({ ...tall, main: movedBy(tall.main, 300, 150) }, 'main', 1000);
    eq(below.background.y, 0);
    eq(below.main.y, 200 + GAP);
    eq(below.main.w, 1000);
    eq(below.background.w, 1000);
    // Stacked: resizing the top one pushes the other, the order stays.
    const grown = settleResize({ ...below, background: resizedBy(below.background, 0, 80) }, 'background', 1000);
    eq(grown.background.y, 0);
    eq(grown.main.y, grown.background.h + GAP);
    // And from stacked back beside each other.
    const back = settleMove({ ...below, main: movedBy(below.main, 0, -(200 + GAP)) }, 'main', 1000);
    eq(back.main.y, 0);
    ok(back.main.w < 1000 && back.background.w < 1000, 'each at about half');
    eq(back.main.w + GAP + back.background.w, 1000);
    // A narrower window keeps them arranged.
    const shrunk = fitLayout(narrower, 700, 400);
    eq(shrunk.background.x + shrunk.background.w, 700);
    eq(shrunk.background.x, shrunk.main.w + GAP);
    eq(fitLayout(narrower, 500, 400).background.y > 0, true, 'stacked when there is no room');
  });

  await test('errorKey: engine errors to messages', () => {
    eq(errorKey('corrupt', 'x'), 'error.corrupt');
    eq(errorKey('invalid', 'single_file_only'), 'error.single_file_only');
    eq(errorKey('unsupported', 'volumes_read_only'), 'error.volumes_read_only');
    eq(errorKey('unsupported', 'other'), 'error.unsupported');
  });
  await test('format table: ZIP, 7z, RAR encrypt; all split', () => {
    for (const f of ['zip', '7z', 'rar']) ok(FORMATS[f].password, f);
    for (const f of FORMAT_NAMES) ok(FORMATS[f].split, `${f} splits`);
    eq(FORMAT_NAMES.length, 12);
  });
}
