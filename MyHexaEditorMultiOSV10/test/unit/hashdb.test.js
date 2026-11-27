// The known-hash database (src/domain/hashdb.js): list formats, categories, export → import round trip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addHash, exportHashList, importHashList, loadHashDb, lookupHash, removeHash, saveHashDb } from '../../src/domain/hashdb.js';

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
const MD5 = 'd41d8cd98f00b204e9800998ecf8427e';
const SHA1 = 'da39a3ee5e6b4b0d3255bfef95601890afd80709';
const SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

test('hash lists: md5sum, sha256sum, BSD, NSRL CSV and bare lines are read', () => {
  const db = loadHashDb(memory());
  const text = [`${MD5}  empty.txt`, `${SHA256} *empty.bin`, `SHA1 (empty.dat) = ${SHA1.toUpperCase()}`,
    '"SHA-1","MD5","CRC32","FileName"', `"${SHA1}","${MD5}","00000000","nsrl-empty"`, '0xCAFEBABE', 'not a hash line', '# comment'].join('\r\n');
  const r = importHashList(db, text, 'known');
  assert.equal(r.skipped, 1);
  assert.equal(lookupHash(db, MD5.toUpperCase()).name, 'nsrl-empty');
  assert.equal(lookupHash(db, SHA256).name, 'empty.bin');
  assert.equal(lookupHash(db, SHA1).category, 'known');
  assert.ok(lookupHash(db, 'cafebabe'));
  assert.equal(lookupHash(db, '00000000').name, 'nsrl-empty', 'the CRC32 column of the NSRL line');
});

test('categories, add / remove, storage and export → import round trip', () => {
  const store = memory();
  const db = loadHashDb(store);
  addHash(db, SHA256, 'empty', 'known');
  addHash(db, MD5, 'bad.exe', 'notable');
  assert.throws(() => addHash(db, 'xyz', 'x'));
  saveHashDb(db, store);
  const back = loadHashDb(store);
  assert.equal(back.entries.size, 2);
  assert.equal(lookupHash(back, MD5).category, 'notable');
  const again = loadHashDb(memory());
  importHashList(again, exportHashList(back));
  assert.deepEqual([...again.entries].sort(), [...back.entries].sort());
  assert.ok(removeHash(again, MD5));
  assert.equal(lookupHash(again, MD5), null);
});
