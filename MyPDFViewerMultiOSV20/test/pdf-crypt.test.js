// Password-protected PDFs: the crypto primitives, decrypting files made by an
// independent tool (qpdf), encrypting files, and checking every result with
// the real pdf.js the viewer uses.
//
// test/fixtures/encrypted/*.pdf were written by qpdf 12 (through pikepdf) from
// a two-page buildPdf() document: user password "user-pw", owner password
// "owner-pw" (except where the file name says otherwise). R4/R6 files use
// object streams, so their objects are only reachable after decryption.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import nodeCrypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument } from 'pdf-lib';
import { buildPdf } from './fixtures/pdf.js';
import {
  md5, rc4, sha256, sha384, sha512, aesCbcEncrypt, aesCbcDecrypt,
} from '../src/lib/pdf-crypto-core.js';
import {
  loadPdfForEditing, encryptPdfBytes, decryptPdfBytes, mayBeEncrypted,
  PdfPasswordError, ALL_PERMISSIONS, ENCRYPTION_METHODS,
} from '../src/lib/pdf-crypt.js';
import { applyPdfProtection, writeWorkspaceIntoPdf } from '../src/lib/pdf-write.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
  path.resolve(import.meta.dirname, '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.min.mjs'),
).href;

const FIXTURES = path.resolve(import.meta.dirname, 'fixtures', 'encrypted');
const fixture = (name) => new Uint8Array(fs.readFileSync(path.join(FIXTURES, name)));
const hex = (b) => Buffer.from(b).toString('hex');

// Opens bytes with pdf.js. `password` answers its prompt once; a second prompt
// (wrong password) or a prompt without a password rejects with the reason.
async function openWithPdfjs(bytes, password) {
  const task = pdfjsLib.getDocument({ data: bytes.slice(), disableWorker: true, isEvalSupported: false });
  const reasons = [];
  task.onPassword = (retry, reason) => {
    reasons.push(reason);
    if (password != null && reasons.length === 1) retry(password);
    else task.destroy();
  };
  try {
    const doc = await task.promise;
    return { doc, reasons };
  } catch (err) {
    return { error: err, reasons };
  }
}

async function pdfjsText(doc) {
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    out.push(tc.items.map((it) => it.str).join(''));
  }
  return out;
}

const encryptedFlag = async (doc) => !!(await doc.getMetadata()).info.EncryptFilterName;

describe('crypto primitives match node:crypto', () => {
  const sizes = [0, 1, 55, 56, 64, 111, 112, 128, 1000, 9000];
  it('MD5 / SHA-256 / SHA-384 / SHA-512', () => {
    for (const n of sizes) {
      const d = new Uint8Array(nodeCrypto.randomBytes(n));
      expect(hex(md5(d))).toBe(nodeCrypto.createHash('md5').update(d).digest('hex'));
      expect(hex(sha256(d))).toBe(nodeCrypto.createHash('sha256').update(d).digest('hex'));
      expect(hex(sha384(d))).toBe(nodeCrypto.createHash('sha384').update(d).digest('hex'));
      expect(hex(sha512(d))).toBe(nodeCrypto.createHash('sha512').update(d).digest('hex'));
    }
  });

  it('AES-128/256-CBC both ways, with and without padding', () => {
    for (const n of sizes) {
      for (const kl of [16, 32]) {
        const d = new Uint8Array(nodeCrypto.randomBytes(n));
        const key = new Uint8Array(nodeCrypto.randomBytes(kl));
        const iv = new Uint8Array(nodeCrypto.randomBytes(16));
        const c = nodeCrypto.createCipheriv(kl === 16 ? 'aes-128-cbc' : 'aes-256-cbc', key, iv);
        const ref = Buffer.concat([c.update(d), c.final()]);
        expect(hex(aesCbcEncrypt(key, iv, d))).toBe(hex(ref));
        expect(hex(aesCbcDecrypt(key, iv, new Uint8Array(ref)))).toBe(hex(d));
      }
    }
    const key = new Uint8Array(16), iv = new Uint8Array(16), block = new Uint8Array(32).fill(7);
    const raw = aesCbcEncrypt(key, iv, block, { pad: false });
    expect(raw.length).toBe(32);
    expect(hex(aesCbcDecrypt(key, iv, raw, { unpad: false }))).toBe(hex(block));
  });

  it('RC4 known-answer vectors', () => {
    const enc = (k, p) => hex(rc4(new TextEncoder().encode(k), new TextEncoder().encode(p)));
    expect(enc('Key', 'Plaintext')).toBe('bbf316e8d940af0ad3');
    expect(enc('Wiki', 'pedia')).toBe('1021bf0420');
    expect(enc('Secret', 'Attack at dawn')).toBe('45a01f645fc35b383552544b9bf5');
  });
});

describe('opening PDFs encrypted by qpdf', () => {
  const variants = [
    ['rc4-40-r2.pdf', 'rc4-40', 2],
    ['rc4-128-r3.pdf', 'rc4-128', 3],
    ['aes128-r4.pdf', 'aes128', 4],
    ['aes256-r6.pdf', 'aes256', 6],
  ];

  for (const [file, method, revision] of variants) {
    it(`${file}: user password decrypts to a plain PDF pdf.js reads without a prompt`, async () => {
      const bytes = fixture(file);
      expect(mayBeEncrypted(bytes)).toBe(true);
      const { pdfDoc, security } = await loadPdfForEditing(bytes, { password: 'user-pw' });
      expect(security).toMatchObject({ method, revision, openedAsOwner: false, userPassword: 'user-pw' });
      expect(pdfDoc.getTitle()).toBe('Locked Title');
      expect(pdfDoc.getAuthor()).toBe('Crypt Tester');
      expect(pdfDoc.getPageCount()).toBe(2);

      const plain = await pdfDoc.save({ useObjectStreams: false });
      const { doc, reasons } = await openWithPdfjs(plain);
      expect(reasons).toEqual([]);
      expect(await encryptedFlag(doc)).toBe(false);
      expect(await pdfjsText(doc)).toEqual(['Secret page one', 'Secret page two']);
      const outline = await doc.getOutline();
      expect(outline?.length).toBeGreaterThan(0);
    });

    it(`${file}: owner password also opens it`, async () => {
      const { pdfDoc, security } = await loadPdfForEditing(fixture(file), { password: 'owner-pw' });
      expect(security.openedAsOwner).toBe(true);
      // R2–R4 let the owner password recover the user password; R6 does not.
      expect(security.userPassword).toBe(revision < 5 ? 'user-pw' : null);
      expect(pdfDoc.getTitle()).toBe('Locked Title');
    });

    it(`${file}: a wrong or missing password is refused`, async () => {
      await expect(loadPdfForEditing(fixture(file), { password: 'nope' })).rejects.toBeInstanceOf(PdfPasswordError);
      await expect(loadPdfForEditing(fixture(file))).rejects.toBeInstanceOf(PdfPasswordError);
    });
  }

  it('owner-only protection opens with an empty password and keeps its permission bits', async () => {
    const bytes = fixture('owner-only-aes256.pdf');
    const { doc, reasons } = await openWithPdfjs(bytes);
    expect(reasons).toEqual([]);    // pdf.js opens it without asking
    const { pdfDoc, security } = await loadPdfForEditing(bytes);
    expect(security.userPassword).toBe('');
    expect(security.permissions).not.toBe(ALL_PERMISSIONS);
    expect(security.permissions & 4).toBe(0);   // printing not allowed
    expect(pdfDoc.getPageCount()).toBe(doc.numPages);
  });

  it('a Korean (non-Latin) password works', async () => {
    const bytes = fixture('korean-pw-aes256.pdf');
    const { reasons, doc } = await openWithPdfjs(bytes, '비밀번호');
    expect(reasons).toEqual([1]);
    expect(doc.numPages).toBe(2);
    const plain = await decryptPdfBytes(bytes, '비밀번호');
    expect(await pdfjsText((await openWithPdfjs(plain)).doc)).toEqual(['Secret page one', 'Secret page two']);
  });

  it('plain PDFs go straight through', async () => {
    const bytes = buildPdf({ pages: [{ text: 'Open' }] });
    const { pdfDoc, security } = await loadPdfForEditing(bytes, { password: 'whatever' });
    expect(security).toBeNull();
    expect(pdfDoc.getPageCount()).toBe(1);
  });
});

describe('encrypting PDFs', () => {
  const plain = () => buildPdf({ pages: [{ text: 'Top secret' }, { text: 'Page 2' }], title: 'Plain Title' });

  for (const method of ENCRYPTION_METHODS) {
    it(`${method}: pdf.js asks for the password, rejects a wrong one, and reads it with the right one`, async () => {
      const locked = await encryptPdfBytes(plain(), { userPassword: 'open-me', method });
      expect(mayBeEncrypted(locked)).toBe(true);
      // The text is no longer visible in the file bytes.
      expect(Buffer.from(locked).includes('Top secret')).toBe(false);
      expect(Buffer.from(locked).includes('Plain Title')).toBe(false);

      const none = await openWithPdfjs(locked);
      expect(none.reasons).toEqual([1]);              // NEED_PASSWORD
      expect(none.doc).toBeUndefined();

      const wrong = await openWithPdfjs(locked, 'nope');
      expect(wrong.reasons).toEqual([1, 2]);          // then INCORRECT_PASSWORD
      expect(wrong.doc).toBeUndefined();

      const right = await openWithPdfjs(locked, 'open-me');
      expect(await encryptedFlag(right.doc)).toBe(true);
      expect(await pdfjsText(right.doc)).toEqual(['Top secret', 'Page 2']);
      expect((await right.doc.getMetadata()).info.Title).toBe('Plain Title');
    });

    it(`${method}: our own decryption round-trips it`, async () => {
      const locked = await encryptPdfBytes(plain(), { userPassword: 'open-me', ownerPassword: 'boss', method });
      const viaUser = await loadPdfForEditing(locked, { password: 'open-me' });
      expect(viaUser.security.method).toBe(method);
      expect(viaUser.pdfDoc.getTitle()).toBe('Plain Title');
      const viaOwner = await loadPdfForEditing(locked, { password: 'boss' });
      expect(viaOwner.security.openedAsOwner).toBe(true);
    });
  }

  it('re-encrypts an already encrypted file with a new password', async () => {
    const relocked = await encryptPdfBytes(fixture('aes128-r4.pdf'), {
      currentPassword: 'user-pw', userPassword: 'fresh',
    });
    expect((await openWithPdfjs(relocked, 'user-pw')).reasons).toEqual([1, 2]);
    const { doc } = await openWithPdfjs(relocked, 'fresh');
    expect(await pdfjsText(doc)).toEqual(['Secret page one', 'Secret page two']);
  });

  it('an empty user password gives owner-only protection that opens without a prompt', async () => {
    const locked = await encryptPdfBytes(plain(), { userPassword: '', ownerPassword: 'boss', permissions: -3904 - 4 });
    const { doc, reasons } = await openWithPdfjs(locked);
    expect(reasons).toEqual([]);
    expect(await encryptedFlag(doc)).toBe(true);
    const { security } = await loadPdfForEditing(locked);
    expect(security.permissions).toBe(-3904 - 4);
  });

  it('pdf-lib can load and save the encrypted output (stays a valid PDF)', async () => {
    const locked = await encryptPdfBytes(plain(), { userPassword: 'x' });
    const doc = await PDFDocument.load(locked, { ignoreEncryption: true });
    expect(doc.getPageCount()).toBe(2);
  });
});

describe('saving with the viewer\'s protection choices', () => {
  const marks = {
    annotations: [{ id: 'h1', kind: 'highlight', page: 1, rects: [{ x: 0.1, y: 0.1, w: 0.3, h: 0.05 }], text: 'hl', color: '#ffd400' }],
    bookmarks: [{ page: 2, label: 'Second', y: 0.2 }],
    attachments: [],
  };

  it('writes markup into an encrypted source (decrypting it first)', async () => {
    const out = await writeWorkspaceIntoPdf(fixture('aes256-r6.pdf'), marks, { password: 'user-pw' });
    const { doc, reasons } = await openWithPdfjs(out);
    expect(reasons).toEqual([]);
    const annots = await (await doc.getPage(1)).getAnnotations();
    expect(annots.some((a) => a.subtype === 'Highlight')).toBe(true);
    expect((await doc.getOutline()).some((o) => o.title === 'Second')).toBe(true);
  });

  it('adds bookmarks to a plain PDF that already has an outline (Count stays a PDF number)', async () => {
    const out = await writeWorkspaceIntoPdf(buildPdf({ pages: [{ text: 'A' }, { text: 'B' }], withOutline: true }), marks);
    const { doc } = await openWithPdfjs(out);
    const outline = await doc.getOutline();
    expect(outline.length).toBeGreaterThan(1);
    expect(outline.at(-1).title).toBe('Second');
  });

  it('mode "none" saves an encrypted source without a password', async () => {
    const marked = await writeWorkspaceIntoPdf(fixture('rc4-128-r3.pdf'), marks, { password: 'user-pw' });
    const res = await applyPdfProtection(marked, { mode: 'none' }, { encrypted: true, password: 'user-pw' });
    expect(res.password).toBeNull();
    const { doc, reasons } = await openWithPdfjs(res.bytes);
    expect(reasons).toEqual([]);
    expect(await encryptedFlag(doc)).toBe(false);
    expect(await pdfjsText(doc)).toEqual(['Secret page one', 'Secret page two']);
  });

  it('mode "keep" keeps the same password on an encrypted source', async () => {
    const marked = await writeWorkspaceIntoPdf(fixture('aes128-r4.pdf'), marks, { password: 'user-pw' });
    const security = (await loadPdfForEditing(fixture('aes128-r4.pdf'), { password: 'user-pw' })).security;
    const res = await applyPdfProtection(marked, { mode: 'keep' }, { encrypted: true, password: 'user-pw', security });
    expect(res.password).toBe('user-pw');
    expect((await openWithPdfjs(res.bytes)).reasons).toEqual([1]);
    const { doc } = await openWithPdfjs(res.bytes, 'user-pw');
    expect(await pdfjsText(doc)).toEqual(['Secret page one', 'Secret page two']);
  });

  it('mode "keep" on owner-only protection stays prompt-free with the same restrictions', async () => {
    const src = fixture('owner-only-aes256.pdf');
    const security = (await loadPdfForEditing(src)).security;
    const marked = await writeWorkspaceIntoPdf(src, marks, { password: '' });
    const res = await applyPdfProtection(marked, { mode: 'keep' }, { encrypted: true, password: '', security });
    const { doc, reasons } = await openWithPdfjs(res.bytes);
    expect(reasons).toEqual([]);
    expect(await encryptedFlag(doc)).toBe(true);
    expect((await loadPdfForEditing(res.bytes)).security.permissions).toBe(security.permissions);
  });

  it('mode "keep" on a plain PDF leaves it plain', async () => {
    const bytes = buildPdf({ pages: [{ text: 'Plain' }] });
    const res = await applyPdfProtection(bytes, { mode: 'keep' }, { encrypted: false });
    expect(res.bytes).toBe(bytes);
    expect(res.password).toBeNull();
  });

  it('mode "set" protects a plain PDF with a new password', async () => {
    const marked = await writeWorkspaceIntoPdf(buildPdf({ pages: [{ text: 'Plain text' }] }), marks);
    const res = await applyPdfProtection(marked, { mode: 'set', password: '새암호123' }, { encrypted: false });
    expect(res.password).toBe('새암호123');
    expect((await openWithPdfjs(res.bytes, 'wrong')).reasons).toEqual([1, 2]);
    const { doc } = await openWithPdfjs(res.bytes, '새암호123');
    expect(await pdfjsText(doc)).toEqual(['Plain text']);
    expect((await (await doc.getPage(1)).getAnnotations()).some((a) => a.subtype === 'Highlight')).toBe(true);
  });

  it('mode "set" without a password is refused', async () => {
    await expect(applyPdfProtection(buildPdf(), { mode: 'set', password: '' }, { encrypted: false }))
      .rejects.toThrow(/password/i);
  });
});
