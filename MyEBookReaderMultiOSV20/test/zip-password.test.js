// Password-protected ZIP containers (EPUB, CBZ, ZIP, FB2.ZIP): the crypto
// primitives checked against node:crypto, archives written by an independent
// tool (7-Zip) opened with their password, and archives this reader writes —
// with a password, or with it taken off — read back by the reader.
//
// test/fixtures/encrypted/ holds files made by 7-Zip 25.01:
//   comic-aes256.cbz     two PNG pages, AES-256, password "user-pw"
//   comic-zipcrypto.cbz  the same, ZipCrypto, password "user-pw"
//   book-aes256.epub     samples/sample.epub, every entry AES-256, "user-pw"
//   novel.txt.zip        samples/sample.txt alone, AES-256, "novel-pw"
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import nodeCrypto from 'node:crypto';
import {
  sha1, hmacSha1, pbkdf2Sha1, aesCtrWinZip,
} from '../src/lib/pdf-crypto-core.js';
import { crc32, ZipPasswordError } from '../src/lib/ebook/zip-crypt.js';
import {
  readZip, readEntry, readEntryText, unlockZip, zipNeedsPassword, zipEncryptionOf,
  rememberZipPassword, zipPasswordOf,
} from '../src/lib/ebook/zip.js';
import { rewriteZip, zipFiles } from '../src/lib/ebook/zip-write.js';
import { openBook } from '../src/lib/ebook/book.js';
import { protectionKind, archiveProtectionOf, buildProtectedCopy } from '../src/lib/protect.js';
import { sampleBytes } from './helpers/samples.mjs';

const FIXTURES = path.resolve(import.meta.dirname, 'fixtures', 'encrypted');
// A fresh copy each time: a remembered password is keyed by the bytes object.
const fixture = (name) => new Uint8Array(fs.readFileSync(path.join(FIXTURES, name)));
const bytes = (s) => new TextEncoder().encode(s);

// An askPassword that answers from a list, recording each reason.
function answers(...list) {
  const reasons = [];
  const ask = async (reason) => { reasons.push(reason); return list.shift() ?? null; };
  return { ask, reasons };
}

describe('crypto primitives for ZIP AES', () => {
  it('SHA-1 and HMAC-SHA1 match node:crypto', () => {
    for (const len of [0, 1, 55, 56, 64, 65, 1000]) {
      const data = nodeCrypto.randomBytes(len);
      expect(Buffer.from(sha1(data)).toString('hex')).toBe(nodeCrypto.createHash('sha1').update(data).digest('hex'));
      const key = nodeCrypto.randomBytes(len % 90);
      expect(Buffer.from(hmacSha1(key, data)).toString('hex'))
        .toBe(nodeCrypto.createHmac('sha1', key).update(data).digest('hex'));
    }
  });

  it('PBKDF2-HMAC-SHA1 matches node:crypto', () => {
    const salt = nodeCrypto.randomBytes(16);
    const pw = bytes('비밀 번호');
    expect(Buffer.from(pbkdf2Sha1(pw, salt, 1000, 66)).toString('hex'))
      .toBe(nodeCrypto.pbkdf2Sync(pw, salt, 1000, 66, 'sha1').toString('hex'));
  });

  it('AES-CTR counts little-endian from 1, as WinZip does', () => {
    const key = nodeCrypto.randomBytes(32);
    const data = nodeCrypto.randomBytes(16 * 300 + 7);   // past a one-byte counter carry
    const ecb = nodeCrypto.createCipheriv('aes-256-ecb', key, null).setAutoPadding(false);
    const counters = Buffer.alloc(16 * 301);
    for (let i = 0; i < 301; i++) counters.writeUInt32LE(i + 1, 16 * i);
    const stream = Buffer.concat([ecb.update(counters), ecb.final()]);
    const expected = Buffer.from(data.map((b, i) => b ^ stream[i]));
    expect(Buffer.from(aesCtrWinZip(key, data)).equals(expected)).toBe(true);
  });

  it('CRC-32 matches the standard check value', () => {
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
  });
});

describe('archives written by 7-Zip', () => {
  it.each([
    ['comic-aes256.cbz', 'user-pw', 'aes256'],
    ['comic-zipcrypto.cbz', 'user-pw', 'zipcrypto'],
    ['book-aes256.epub', 'user-pw', 'aes256'],
    ['novel.txt.zip', 'novel-pw', 'aes256'],
  ])('%s: refuses a wrong password, then reads every entry with the right one', (name, pw, encryption) => {
    const data = fixture(name);
    const zip = readZip(data);
    expect(zip.encrypted).toBe(true);
    expect(zipNeedsPassword(zip)).toBe(true);
    expect(zipEncryptionOf(zip)).toBe(encryption);
    const first = zip.entries.find((e) => !e.directory);
    expect(() => readEntry(zip, first)).toThrow(ZipPasswordError);

    expect(unlockZip(zip, 'wrong password')).toBe(false);
    expect(zipNeedsPassword(zip)).toBe(true);
    expect(unlockZip(zip, pw)).toBe(true);
    for (const e of zip.entries.filter((x) => !x.directory)) {
      expect(readEntry(zip, e).length).toBe(e.uncompressedSize);
    }
    // Every later read of the same bytes already has the password.
    expect(zipNeedsPassword(readZip(data))).toBe(false);
    expect(zipPasswordOf(data)).toBe(pw);
  });

  it('decrypts to exactly the original files', () => {
    const zip = readZip(fixture('book-aes256.epub'));
    unlockZip(zip, 'user-pw');
    const original = readZip(sampleBytes('sample.epub'));
    for (const e of original.entries.filter((x) => !x.directory)) {
      const name = e.name;
      expect(Buffer.from(readEntry(zip, name)).equals(Buffer.from(readEntry(original, e)))).toBe(true);
    }
  });
});

describe('opening protected books', () => {
  it('asks for the password of an AES comic, again when it is wrong', async () => {
    const { ask, reasons } = answers('nope', 'user-pw');
    const book = await openBook({ data: fixture('comic-aes256.cbz'), name: 'comic.cbz', askPassword: ask });
    expect(reasons).toEqual(['needed', 'wrong']);
    expect(book.format).toBe('cbz');
    expect(book.sectionCount).toBe(2);
    book.destroy();
  });

  it('opens a ZipCrypto comic and a fully encrypted EPUB', async () => {
    const comic = await openBook({ data: fixture('comic-zipcrypto.cbz'), name: 'c.cbz', askPassword: answers('user-pw').ask });
    expect(comic.sectionCount).toBe(2);
    comic.destroy();
    const epub = await openBook({ data: fixture('book-aes256.epub'), name: 'b.epub', askPassword: answers('user-pw').ask });
    expect(epub.format).toBe('epub');
    expect(epub.sectionCount).toBeGreaterThan(0);
    expect(epub.sectionText(0).trim().length).toBeGreaterThan(10);
    epub.destroy();
  });

  it('opens the one book inside a protected ZIP as that book', async () => {
    const book = await openBook({ data: fixture('novel.txt.zip'), name: 'novel.txt.zip', askPassword: answers('novel-pw').ask });
    expect(book.format).toBe('txt');
    expect(book.fileName).toBe('novel.txt');
    const text = Array.from({ length: book.sectionCount }, (_, i) => book.sectionText(i)).join(' ');
    expect(text.length).toBeGreaterThan(100);
    book.destroy();
  });

  it('does not ask again for bytes it already opened (relayout at another font size)', async () => {
    const data = fixture('comic-aes256.cbz');
    (await openBook({ data, name: 'c.cbz', askPassword: answers('user-pw').ask })).destroy();
    const { ask, reasons } = answers();
    (await openBook({ data, name: 'c.cbz', askPassword: ask })).destroy();
    expect(reasons).toEqual([]);
  });

  it('stops quietly when the reader cancels the prompt', async () => {
    const err = await openBook({ data: fixture('comic-aes256.cbz'), name: 'c.cbz', askPassword: answers(null).ask })
      .catch((e) => e);
    expect(err.name).toBe('AbortError');
    expect(err.passwordCancelled).toBe(true);
  });

  it('says it is password protected when nobody can be asked', async () => {
    await expect(openBook({ data: fixture('comic-aes256.cbz'), name: 'c.cbz' })).rejects.toThrow(ZipPasswordError);
  });
});

describe('saving with and without a password', () => {
  const unlocked = (name, pw) => {
    const data = fixture(name);
    expect(unlockZip(readZip(data), pw)).toBe(true);
    return data;
  };

  it.each(['aes256', 'zipcrypto'])('puts a %s password on a plain EPUB, and the result opens', async (encryption) => {
    const out = rewriteZip(sampleBytes('sample.epub'), { password: '새 암호 1', encryption });
    const zip = readZip(out);
    expect(zip.encrypted).toBe(true);
    expect(zipEncryptionOf(zip)).toBe(encryption);
    // The EPUB "mimetype" stays readable and stored, as the container rules want.
    expect(zip.entries[0].name).toBe('mimetype');
    expect(zip.entries[0].encrypted).toBe(false);
    expect(readEntryText(zip, 'mimetype')).toBe('application/epub+zip');
    const { ask, reasons } = answers('wrong', '새 암호 1');
    const book = await openBook({ data: out, name: 'x.epub', askPassword: ask });
    expect(reasons).toEqual(['needed', 'wrong']);
    expect(book.format).toBe('epub');
    book.destroy();
  });

  it('takes the password off: every entry comes out unencrypted and identical', () => {
    for (const [name, pw] of [['comic-aes256.cbz', 'user-pw'], ['comic-zipcrypto.cbz', 'user-pw'], ['book-aes256.epub', 'user-pw']]) {
      const src = unlocked(name, pw);
      const out = rewriteZip(src, {});
      const plain = readZip(out);
      expect(plain.encrypted).toBe(false);
      const locked = readZip(src);
      for (const e of plain.entries.filter((x) => !x.directory)) {
        expect(e.encrypted).toBe(false);
        expect(Buffer.from(readEntry(plain, e)).equals(Buffer.from(readEntry(locked, e.name)))).toBe(true);
      }
    }
  });

  it('gives an AE-2 entry (no CRC stored) its real CRC when the password comes off', () => {
    const plain = readZip(rewriteZip(unlocked('comic-aes256.cbz', 'user-pw'), {}));
    for (const e of plain.entries.filter((x) => !x.directory)) {
      expect(e.crc).toBe(crc32(readEntry(plain, e)));
    }
  });

  it('changes a password', () => {
    const out = rewriteZip(unlocked('novel.txt.zip', 'novel-pw'), { password: 'other' });
    const zip = readZip(out);
    expect(unlockZip(zip, 'novel-pw')).toBe(false);
    expect(unlockZip(zip, 'other')).toBe(true);
  });

  it('cannot rewrite a protected archive without its password', () => {
    expect(() => rewriteZip(fixture('comic-aes256.cbz'), {})).toThrow(ZipPasswordError);
  });

  it('zipFiles keeps Korean names and contents', () => {
    const data = bytes('첫 줄\n둘째 줄');
    const zip = readZip(zipFiles([{ name: '소설.txt', data }], { password: 'pw' }));
    expect(zip.entries[0].name).toBe('소설.txt');
    expect(unlockZip(zip, 'pw')).toBe(true);
    expect(readEntryText(zip, '소설.txt')).toBe('첫 줄\n둘째 줄');
  });
});

describe('lib/protect.js — what Save writes', () => {
  const txt = sampleBytes('sample.txt');

  it('classifies a book by how it is protected', () => {
    expect(protectionKind({ isPdf: true, data: sampleBytes('sample.pdf') })).toBe('pdf');
    expect(protectionKind({ data: sampleBytes('sample.epub') })).toBe('archive');
    expect(protectionKind({ data: txt })).toBe('file');
    expect(protectionKind({ data: null, pictures: [{ name: 'a.png', bytes: new Uint8Array(1) }] })).toBe('folder');
  });

  it('reports an archive\'s protection and the password it was opened with', () => {
    expect(archiveProtectionOf(sampleBytes('sample.epub'))).toEqual({ encrypted: false, encryption: null, password: null });
    const data = fixture('comic-zipcrypto.cbz');
    expect(archiveProtectionOf(data)).toEqual({ encrypted: true, encryption: 'zipcrypto', password: null });
    rememberZipPassword(data, 'user-pw');
    expect(archiveProtectionOf(data).password).toBe('user-pw');
    expect(archiveProtectionOf(txt).encrypted).toBe(false);
  });

  it('protects a plain text book by putting it in a password ZIP, which opens back into the book', async () => {
    const { bytes: out, name } = buildProtectedCopy({ name: 'sample.txt', data: txt }, { mode: 'set', password: 'p 1' });
    expect(name).toBe('sample.txt.zip');
    const book = await openBook({ data: out, name, askPassword: answers('p 1').ask });
    expect(book.format).toBe('txt');
    book.destroy();
  });

  it('leaves a plain file as it is without a password', () => {
    const { bytes: out, name } = buildProtectedCopy({ name: 'sample.txt', data: txt }, { mode: 'keep' });
    expect(out).toBe(txt);
    expect(name).toBe('sample.txt');
  });

  it('removes, keeps or changes an archive\'s password', () => {
    const data = fixture('comic-aes256.cbz');
    unlockZip(readZip(data), 'user-pw');
    const book = { name: 'comic.cbz', data };
    expect(buildProtectedCopy(book, { mode: 'keep' }).bytes).toBe(data);
    const none = buildProtectedCopy(book, { mode: 'none' });
    expect(none.name).toBe('comic.cbz');
    expect(readZip(none.bytes).encrypted).toBe(false);
    const set = buildProtectedCopy(book, { mode: 'set', password: 'x', encryption: 'zipcrypto' });
    expect(zipEncryptionOf(readZip(set.bytes))).toBe('zipcrypto');
  });

  it('saves a picture folder as a ZIP, with distinct names', () => {
    const pictures = [
      { name: 'ch1/001.png', bytes: new Uint8Array([1, 2]) },
      { name: 'ch2/001.png', bytes: new Uint8Array([3]) },
    ];
    const { bytes: out, name } = buildProtectedCopy({ name: 'My Comic', data: null, pictures }, { mode: 'set', password: 'pw' });
    expect(name).toBe('My Comic.zip');
    const zip = readZip(out);
    unlockZip(zip, 'pw');
    expect(zip.entries.map((e) => e.name)).toEqual(['001.png', '0002-001.png']);
    expect([...readEntry(zip, '0002-001.png')]).toEqual([3]);
  });

  it('needs a password to protect', () => {
    expect(() => buildProtectedCopy({ name: 'a.txt', data: txt }, { mode: 'set', password: '' })).toThrow(/password/);
  });
});
