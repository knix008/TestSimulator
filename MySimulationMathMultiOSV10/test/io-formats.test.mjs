// Archives (zip/gzip/tar), XLSX, JSON and XML of the I/O area.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createMemoryFs } from '../core/fs-memory.js';
import { str, num, matrix, rowVec, cellRow, structOf, stringArray, tensor, toStr, struct, bool, charMatrix } from '../core/value.js';
import * as archive from '../core/lib/io/archive.js';
import * as xlsx from '../core/lib/io/xlsx.js';
import * as json from '../core/lib/io/json.js';
import * as xml from '../core/lib/io/xml.js';

const FIX = new URL('./fixtures/io/', import.meta.url);
const fixture = (name) => new Uint8Array(fs.readFileSync(new URL(name, FIX)));
const enc = new TextEncoder(), dec = new TextDecoder();

function makeCtx(files = {}) {
  const builtins = { ...archive.builtins, ...xlsx.builtins, ...json.builtins, ...xml.builtins };
  // A small ctx of its own, so these tests do not depend on other areas.
  const ctx = {
    fs: createMemoryFs(files), state: {}, host: { post() {}, request() { return null; } },
    out() {}, errOut() {}, warning() {}, checkInterrupt() {},
    call(name, args, nargout = 1) { const r = builtins[name](args, nargout, ctx); return Array.isArray(r) ? r : r === undefined ? [] : [r]; },
  };
  const call = (name, args, nargout = 1) => ctx.call(name, args, nargout);
  return { ctx, call, fs: ctx.fs };
}
const cellStrs = (c) => c.data.map((x) => toStr(x));
const field = (s, ...path) => { let v = s; for (const f of path) { if (typeof f === 'number') v = v.data ? v : v; else v = v.data[0][f]; } return v; };
const elem = (s, i) => struct([1, 1], s.fields, [s.data[i]]);

// ---------------------------------------------------------------- archives

test('zipWrite/zipRead round trip (stored, deflated, UTF-8 names, folders)', () => {
  const big = enc.encode('abcabcabc '.repeat(5000));
  const entries = [
    { name: 'dir/', data: null },
    { name: 'dir/big.txt', data: big },
    { name: 'empty.bin', data: new Uint8Array(0) },
    { name: '한글.txt', data: enc.encode('가나다') },
    { name: 'rand.bin', data: Uint8Array.from({ length: 300 }, (_, i) => (i * 7919) & 255) },
  ];
  const z = archive.zipWrite(entries, { level: 6 });
  assert.ok(z.length < big.length / 10, 'compressed');
  const back = archive.zipRead(z);
  assert.deepEqual(back.map((e) => e.name), entries.map((e) => e.name));
  assert.equal(back[0].isDir, true);
  assert.deepEqual(back[1].data, big);
  assert.equal(back[2].data.length, 0);
  assert.equal(dec.decode(back[3].data), '가나다');
  assert.deepEqual(back[4].data, entries[4].data);
  assert.ok(back[1].mtime instanceof Date);
});

test('zip/unzip builtins: wildcards, folders, root folder, returned lists', () => {
  const { call, fs: mfs } = makeCtx({ '/home/p/a.txt': 'A', '/home/p/b.txt': 'BB', '/home/p/c.dat': 'C', '/home/p/sub/d.txt': 'DDD' });
  const names = call('zip', [str('out.zip'), cellRow([str('*.txt'), str('sub')]), str('/home/p')]);
  assert.deepEqual(cellStrs(names[0]), ['a.txt', 'b.txt', 'sub/d.txt']);
  assert.equal(names[0].dims[0], 1);
  assert.ok(mfs.exists('/home/out.zip'));
  const got = call('unzip', [str('out'), str('/x/y')]);
  assert.deepEqual(cellStrs(got[0]), ['/x/y/a.txt', '/x/y/b.txt', '/x/y/sub/d.txt']);
  assert.equal(mfs.readText('/x/y/sub/d.txt'), 'DDD');
  assert.equal(mfs.readText('/x/y/b.txt'), 'BB');
  assert.throws(() => call('zip', [str('o.zip'), str('nothere.txt')]), (e) => e.identifier === 'io:zip:fileNotFound');
  assert.throws(() => call('zip', [str('o.zip'), str('/home/p/*.none')]), (e) => e.identifier === 'io:zip:noFiles');
});

test('unzip reads an archive made by an external tool', () => {
  const { call, fs: mfs } = makeCtx({ '/home/ext.zip': fixture('fmt_ext.zip') });
  const got = cellStrs(call('unzip', [str('ext.zip'), str('/out')])[0]);
  assert.ok(got.includes('/out/data/a.txt') && got.includes('/out/data/sub/nums.txt'), got.join());
  assert.equal(mfs.readText('/out/data/a.txt').replace(/\r/g, ''), 'hello zip\n');
  const nums = mfs.readText('/out/data/sub/nums.txt').trim().split(/\r?\n/);
  assert.equal(nums.length, 2000); assert.equal(nums[1999], '2000');
});

test('unzip refuses entries that leave the output folder', () => {
  const z = archive.zipWrite([{ name: '../evil.txt', data: enc.encode('x') }]);
  const { call } = makeCtx({ '/home/bad.zip': z });
  assert.throws(() => call('unzip', [str('bad.zip'), str('/out')]), (e) => e.identifier === 'io:unzip:unsafePath');
});

test('gzip/gunzip builtins round trip, output folder', () => {
  const text = 'line\n'.repeat(1000);
  const { call, fs: mfs } = makeCtx({ '/home/a.txt': text, '/home/b.txt': 'b' });
  const gz = cellStrs(call('gzip', [str('*.txt'), str('/gz')])[0]);
  assert.deepEqual(gz, ['/gz/a.txt.gz', '/gz/b.txt.gz']);
  assert.ok(mfs.stat('/gz/a.txt.gz').size < 200);
  const back = cellStrs(call('gunzip', [str('/gz/a.txt.gz'), str('/un')])[0]);
  assert.deepEqual(back, ['/un/a.txt']);
  assert.equal(mfs.readText('/un/a.txt'), text);
  call('gzip', [str('b.txt')], 0);
  mfs.remove('/home/b.txt');
  call('gunzip', [str('b.txt.gz')], 0);
  assert.equal(mfs.readText('/home/b.txt'), 'b');
});

test('tar/untar round trip (.tar and .tgz, long names)', () => {
  const longName = 'deep/' + 'x'.repeat(120) + '.txt';
  const { call, fs: mfs } = makeCtx({ '/home/src/one.txt': '1', '/home/src/two/three.txt': '333', ['/home/src/' + longName]: 'long' });
  for (const name of ['arch.tar', 'arch.tgz']) {
    const list = cellStrs(call('tar', [str(name), str('.'), str('/home/src')])[0]);
    assert.ok(list.includes('one.txt') && list.includes('two/three.txt') && list.includes(longName), list.join());
    const out = '/t/' + name;
    const files = cellStrs(call('untar', [str(name), str(out)])[0]);
    assert.equal(files.length, 3);
    assert.equal(mfs.readText(out + '/two/three.txt'), '333');
    assert.equal(mfs.readText(out + '/' + longName), 'long');
  }
  const t = mfs.readBytes('/home/arch.tgz');
  assert.equal(t[0], 0x1f); assert.equal(t[1], 0x8b);
});

test('untar reads a .tar.gz made by an external tool', () => {
  const { call, fs: mfs } = makeCtx({ '/home/ext.tar.gz': fixture('fmt_ext.tar.gz') });
  call('untar', [str('ext.tar.gz'), str('/o')], 0);
  assert.equal(mfs.readText('/o/data/a.txt'), 'hello zip\n');
  assert.equal(mfs.readText('/o/data/sub/nums.txt').trim().split('\n').length, 2000);
});

// ---------------------------------------------------------------- XLSX

test('writeXlsx/readXlsx: numbers, shared strings, booleans, dates, holes', () => {
  const d = new Date(Date.UTC(2024, 1, 29));
  const rows = [['Name', 'Value', 'Ok', 'When'], ['alpha', 1.5, true, d], ['beta', -2, false, { date: 45351.5 }], [null, null, null, null], ['alpha', 1e-12, null, null]];
  const bytes = xlsx.writeXlsx(null, 'Data', rows);
  const wb = xlsx.readXlsx(bytes);
  assert.deepEqual(wb.sheetNames, ['Data']);
  const r = wb.rows('Data');
  assert.equal(r.length, 5);
  assert.deepEqual(r[0], ['Name', 'Value', 'Ok', 'When']);
  assert.deepEqual(r[1].slice(0, 3), ['alpha', 1.5, true]);
  assert.deepEqual(r[1][3], { date: 45351 });
  assert.deepEqual(r[2][3], { date: 45351.5 });
  assert.deepEqual(r[3], [null, null, null, null]);
  assert.deepEqual(r[4], ['alpha', 1e-12, null, null]);
  // shared strings are de-duplicated
  const sst = dec.decode(archive.zipRead(bytes).find((e) => e.name === 'xl/sharedStrings.xml').data);
  assert.equal((sst.match(/<si>/g) || []).length, 6);
  assert.deepEqual(xlsx.xlsxSheetNames(bytes), ['Data']);
});

test('writeXlsx merges into an existing workbook and adds sheets', () => {
  let b = xlsx.writeXlsx(null, 1, [[1, 2], [3, 4]]);
  b = xlsx.writeXlsx(b, 'Second', [['x']], 'B2');
  b = xlsx.writeXlsx(b, 1, [[9, 'y']], 'B2');
  b = xlsx.writeXlsx(b, 4, [[7]]);
  const wb = xlsx.readXlsx(b);
  assert.deepEqual(wb.sheetNames, ['Sheet1', 'Second', 'Sheet3', 'Sheet4']);
  assert.deepEqual(wb.rows(1), [[1, 2, null], [3, 9, 'y']]);
  assert.deepEqual(wb.rows('second'), [[null, null], [null, 'x']]);
  assert.deepEqual(wb.rows(3), []);
  assert.deepEqual(wb.rows(4), [[7]]);
  assert.throws(() => wb.rows('Nope'), (e) => e.identifier === 'io:xlsx:badSheet');
  assert.throws(() => wb.rows(9), (e) => e.identifier === 'io:xlsx:badSheet');
});

test('readXlsx handles inline strings, formula strings, errors, custom date formats and rows without references', () => {
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const rns = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const files = [
    ['[Content_Types].xml', '<Types/>'],
    ['_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', `<workbook ${ns} ${rns}><sheets><sheet name="Only" sheetId="7" r:id="rIdS"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/s.xml"/><Relationship Id="rIdT" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml', `<styleSheet ${ns}><numFmts count="2"><numFmt numFmtId="170" formatCode="dd/mm/yyyy"/><numFmt numFmtId="171" formatCode="&quot;d&quot;0.00"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="170"/><xf numFmtId="171"/></cellXfs></styleSheet>`],
    ['xl/worksheets/s.xml', `<worksheet ${ns}><sheetData><row><c t="inlineStr"><is><r><t>rich </t></r><r><t>text</t></r></is></c><c t="str"><f>A1</f><v>calc</v></c></row>`
      + '<row><c s="1"><v>45000</v></c><c s="2"><v>3.25</v></c><c t="e"><v>#DIV/0!</v></c><c t="b"><v>1</v></c></row>'
      + '<row r="5"><c r="C5"><v>  7 </v></c></row></sheetData></worksheet>'],
  ];
  const b = archive.zipWrite(files.map(([name, s]) => ({ name, data: enc.encode(s) })));
  const wb = xlsx.readXlsx(b);
  assert.deepEqual(wb.sheetNames, ['Only']);
  assert.deepEqual(wb.rows(), [['rich text', 'calc', null, null], [{ date: 45000 }, 3.25, null, true], [null, null, null, null], [null, null, null, null], [null, null, 7, null]]);
});

test('xlswrite/xlsread: num/txt/raw, sheet and range arguments', () => {
  const { call, fs: mfs } = makeCtx();
  const data = cellRow([str('t'), str('y')]);
  call('xlswrite', [str('book.xlsx'), { ...data, dims: [1, 2] }, str('Res')], 0);
  call('xlswrite', [str('book.xlsx'), matrix([[0, 1], [1, 4], [2, 9]]), str('Res'), str('A2')], 0);
  assert.ok(mfs.exists('/home/book.xlsx'));
  const [n, t, raw] = call('xlsread', [str('book.xlsx'), str('Res')], 3);
  assert.deepEqual(n.dims, [3, 2]);
  assert.deepEqual(Array.from(n.re), [0, 1, 2, 1, 4, 9]);
  assert.deepEqual(t.dims, [1, 2]);
  assert.deepEqual(cellStrs(t), ['t', 'y']);
  assert.deepEqual(raw.dims, [4, 2]);
  assert.equal(toStr(raw.data[0]), 't');
  assert.equal(raw.data[7].re[0], 9);
  const sub = call('xlsread', [str('book.xlsx'), str('Res'), str('B3:B4')]);
  assert.deepEqual(sub[0].dims, [2, 1]); assert.deepEqual(Array.from(sub[0].re), [4, 9]);
  const byRange = call('xlsread', [str('book.xlsx'), str('A3:A4')]);
  assert.deepEqual(Array.from(byRange[0].re), [1, 2]);
  const sn = call('sheetnames', [str('book.xlsx')])[0];
  assert.equal(sn.cls, 'string'); assert.deepEqual(sn.data, ['Res']);
  const [desc, sheets] = call('xlsfinfo', [str('book.xlsx')], 2);
  assert.ok(toStr(desc).length > 0); assert.deepEqual(cellStrs(sheets), ['Res']);
  // xlswrite with a range clips the data
  call('xlswrite', [str('clip'), matrix([[1, 2, 3], [4, 5, 6]]), num(2), str('B1:C1')], 0);
  assert.deepEqual(Array.from(call('xlsread', [str('clip.xlsx'), num(2)])[0].re), [1, 2]);
  assert.throws(() => call('xlsread', [str('missing.xlsx')]), (e) => e.identifier === 'io:fileNotFound');
});

// ---------------------------------------------------------------- JSON

test('jsonencode: scalars, arrays, matrices, structs, cells, text, options', () => {
  const { call } = makeCtx();
  const J = (v, ...o) => toStr(call('jsonencode', [v, ...o])[0]);
  assert.equal(J(num(3)), '3');
  assert.equal(J(num(0.1)), '0.1');
  assert.equal(J(rowVec([1, 2, 3])), '[1,2,3]');
  assert.equal(J(tensor('double', [3, 1], [1, 2, 3])), '[1,2,3]');
  assert.equal(J(matrix([[1, 2], [3, 4]])), '[[1,2],[3,4]]');
  assert.equal(J(tensor('double', [2, 1, 2], [1, 2, 3, 4])), '[[[1,3]],[[2,4]]]');
  assert.equal(J(rowVec([NaN, Infinity])), '[null,null]');
  assert.equal(J(rowVec([NaN, -Infinity]), str('ConvertInfAndNaN'), bool(false)), '[NaN,-Infinity]');
  assert.equal(J(tensor('logical', [1, 2], [1, 0])), '[true,false]');
  assert.equal(J(str('a"b\n')), '"a\\"b\\n"');
  assert.equal(J(charMatrix(['ab', 'cd'])), '["ab","cd"]');
  assert.equal(J(stringArray([1, 2], ['x', null])), '["x",null]');
  assert.equal(J(tensor('double', [0, 0])), '[]');
  assert.equal(J(cellRow([num(1), str('a')])), '[1,"a"]');
  assert.equal(J(cellRow([num(1)])), '[1]');
  assert.equal(J(structOf({ a: num(1), b: str('x') })), '{"a":1,"b":"x"}');
  const sa = struct([1, 2], ['k'], [{ k: num(1) }, { k: num(2) }]);
  assert.equal(J(sa), '[{"k":1},{"k":2}]');
  assert.equal(J(structOf({ a: rowVec([1, 2]) }), str('PrettyPrint'), bool(true)), '{\n  "a": [\n    1,\n    2\n  ]\n}');
  assert.equal(J(tensor('int8', [1, 1], [-5])), '-5');
  assert.throws(() => call('jsonencode', [{ cls: 'double', dims: [1, 1], re: Float64Array.of(1), im: Float64Array.of(1) }]), (e) => e.identifier === 'io:jsonencode:complex');
});

test('jsondecode: arrays, matrices, struct arrays, cells, names, null', () => {
  const { call } = makeCtx();
  const v = call('jsondecode', [str(dec.decode(fixture('fmt_data.json')))])[0];
  assert.equal(v.cls, 'struct');
  assert.deepEqual(v.fields, ['name', 'validId', 'x1st', 'values', 'matrix', 'items', 'mixed', 'empty', 'nothing', 'xIf']);
  const r = v.data[0];
  assert.equal(toStr(r.name), 'probe');
  assert.equal(r.x1st.cls, 'logical');
  assert.deepEqual(r.values.dims, [4, 1]);
  assert.ok(Number.isNaN(r.values.re[2]));
  assert.deepEqual(r.matrix.dims, [2, 3]);
  assert.deepEqual(Array.from(r.matrix.re), [1, 4, 2, 5, 3, 6]);
  assert.equal(r.items.cls, 'struct'); assert.deepEqual(r.items.dims, [2, 1]);
  assert.equal(toStr(r.items.data[1].b), 'y');
  assert.equal(r.mixed.cls, 'cell'); assert.deepEqual(r.mixed.dims, [3, 1]);
  assert.equal(r.mixed.data[2].cls, 'struct');
  assert.deepEqual(r.empty.dims, [0, 0]); assert.deepEqual(r.nothing.dims, [0, 0]);
  // differing fields → cell of structs; boolean array → logical
  const c = call('jsondecode', [str('[{"a":1},{"b":2}]')])[0];
  assert.equal(c.cls, 'cell');
  assert.equal(call('jsondecode', [str('[true,false]')])[0].cls, 'logical');
  assert.deepEqual(call('jsondecode', [str('{"a b":1,"a_b":2,"aB":3}')])[0].fields, ['aB', 'a_b', 'aB_1']);
  assert.deepEqual(call('jsondecode', [str('{"a b":1}'), str('MakeValidName'), bool(false)])[0].fields, ['a b']);
  assert.throws(() => call('jsondecode', [str('{"a":}')]), (e) => e.identifier === 'io:jsondecode:parseError');
  // round trip
  const s = structOf({ m: matrix([[1, 2], [3, 4]]), t: str('hi'), z: cellRow([num(1), str('q')]) });
  const back = call('jsondecode', [call('jsonencode', [s])[0]])[0];
  assert.deepEqual(Array.from(back.data[0].m.re), [1, 3, 2, 4]);
  assert.equal(toStr(back.data[0].t), 'hi');
  assert.equal(back.data[0].z.cls, 'cell');
});

// ---------------------------------------------------------------- XML

test('xmlread gives a struct tree; xmlwrite round-trips it', () => {
  const { call, fs: mfs } = makeCtx({ '/home/music.xml': fixture('fmt_music.xml') });
  const doc = call('xmlread', [str('music.xml')])[0];
  assert.equal(toStr(doc.data[0].Name), '#document');
  const kids = doc.data[0].Children;
  assert.deepEqual(kids.data.map((k) => toStr(k.Name)), ['#comment', 'MusicalEnsemble']);
  const root = kids.data[1];
  const ens = root.Children.data[0];
  assert.equal(toStr(ens.Name), 'Ensemble');
  const band = ens.Children.data.find((k) => toStr(k.Name) === 'BandName');
  assert.equal(toStr(band.Children.data[0].Data), 'Kool & the Gang');
  const note = ens.Children.data.find((k) => toStr(k.Name) === 'Note');
  assert.equal(toStr(note.Children.data[0].Name), '#cdata-section');
  assert.equal(toStr(note.Children.data[0].Data), 'a < b');
  const inst = ens.Children.data.find((k) => toStr(k.Name) === 'Instrumentation').Children.data[0];
  assert.equal(toStr(inst.Attributes.data[0].Name), 'type');
  assert.equal(toStr(inst.Attributes.data[0].Value), 'wind');
  assert.deepEqual(root.Attributes.dims, [1, 0]);
  // write and read back
  call('xmlwrite', [str('/home/copy.xml'), doc], 0);
  const text = mfs.readText('/home/copy.xml');
  assert.ok(text.startsWith('<?xml'));
  assert.ok(text.includes('Kool &amp; the Gang'));
  const doc2 = call('xmlread', [str('copy.xml')])[0];
  const flat = (n) => [toStr(n.Name), toStr(n.Data).trim(), n.Attributes.data.map((a) => toStr(a.Name) + '=' + toStr(a.Value)).join(','), n.Children.data.map(flat)];
  assert.deepEqual(flat(doc2.data[0]), flat(doc.data[0]));
  const asText = toStr(call('xmlwrite', [doc])[0]);
  assert.ok(asText.includes('<Instrument type="wind">Trumpet</Instrument>'));
  assert.throws(() => xml.parseXml('<a><b></a>'), (e) => e.identifier === 'io:xml:parseError');
  assert.throws(() => xml.parseXml('<a x=1/>'), (e) => e.identifier === 'io:xml:parseError');
  assert.equal(xml.decodeEntities('&#65;&#x42;&lt;&unknown;'), 'AB<&unknown;');
});

test('readstruct (XML): attributes, Text, repeated elements, numbers', () => {
  const { call } = makeCtx({ '/home/music.xml': fixture('fmt_music.xml') });
  const s = call('readstruct', [str('music.xml')])[0];
  assert.deepEqual(s.fields, ['Ensemble', 'Musicians']);
  const ens = s.data[0].Ensemble.data[0];
  assert.equal(ens.Music.cls, 'string'); assert.equal(ens.Music.data[0], 'Jazz');
  assert.equal(ens.Founded.cls, 'double'); assert.equal(ens.Founded.re[0], 1964);
  const inst = ens.Instrumentation.data[0].Instrument;
  assert.deepEqual(inst.dims, [1, 3]);
  assert.deepEqual(inst.fields, ['typeAttribute', 'Text', 'pianotype']);
  assert.equal(inst.data[1].typeAttribute.data[0], 'percussion');
  assert.equal(inst.data[1].pianotype.data[0], 'concert grand');
  assert.equal(inst.data[0].pianotype.dims[0], 0);
  const names = s.data[0].Musicians.data[0].Name;
  assert.deepEqual(names.dims, [1, 2]);
  assert.equal(names.data[1].roleAttribute.data[0], 'pianist');
  assert.equal(names.data[1].Text.data[0], 'Ronald');
  const s2 = call('readstruct', [str('music.xml'), str('AttributeSuffix'), str('_a')])[0];
  assert.ok(s2.data[0].Musicians.data[0].Name.fields.includes('role_a'));
  const sel = call('readstruct', [str('music.xml'), str('StructSelector'), str('/MusicalEnsemble/Musicians')])[0];
  assert.deepEqual(sel.fields, ['Name']);
});

test('writestruct/readstruct round trip (XML and JSON)', () => {
  const { call, fs: mfs } = makeCtx();
  const pts = struct([1, 2], ['xAttribute', 'label'], [{ xAttribute: num(1), label: stringArray([1, 1], ['a']) }, { xAttribute: num(2), label: stringArray([1, 1], ['b & c']) }]);
  const s = structOf({ title: stringArray([1, 1], ['Run 1']), count: num(42), vals: rowVec([1.5, 2, 3]), point: pts, flag: bool(true) });
  call('writestruct', [s, str('r.xml'), str('StructNodeName'), str('result')], 0);
  const text = mfs.readText('/home/r.xml');
  assert.ok(text.includes('<result>') && text.includes('<point x="1">') && text.includes('b &amp; c'), text);
  const back = call('readstruct', [str('r.xml')])[0];
  const r = back.data[0];
  assert.equal(r.title.data[0], 'Run 1');
  assert.equal(r.count.re[0], 42);
  assert.deepEqual(Array.from(r.vals.re), [1.5, 2, 3]);
  assert.deepEqual(r.point.dims, [1, 2]);
  assert.equal(r.point.data[1].xAttribute.re[0], 2);
  assert.equal(r.point.data[1].label.data[0], 'b & c');
  assert.equal(r.flag.data[0], 'true');
  // JSON
  call('writestruct', [structOf({ a: num(1), b: str('two'), c: rowVec([1, 2, 3]) }), str('r.json')], 0);
  assert.ok(mfs.readText('/home/r.json').includes('\n'));
  const j = call('readstruct', [str('r.json')])[0];
  assert.equal(j.data[0].a.re[0], 1);
  assert.equal(toStr(j.data[0].b), 'two');
  assert.deepEqual(j.data[0].c.dims, [3, 1]);
  const j2 = call('readstruct', [str('r.json'), str('FileType'), str('json')])[0];
  assert.deepEqual(j2.fields, ['a', 'b', 'c']);
  assert.throws(() => call('writestruct', [num(1), str('x.xml')]), (e) => e.identifier === 'io:writestruct:notStruct');
});

test('every builtin of these modules has en/ko help with syntax', () => {
  for (const m of [archive, xlsx, json, xml]) {
    for (const name of Object.keys(m.builtins)) {
      const h = m.help[name];
      assert.ok(h && h.en && h.ko && Array.isArray(h.syntax) && h.syntax.length, `help for ${name}`);
    }
  }
});

void field; void elem;
