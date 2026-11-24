// Opening an encrypted PDF must ask for the password and never hang:
// awaitPdfPassword drives a real pdf.js loading task through right, wrong and
// cancelled answers, and hides the progress UI while the prompt is up.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildPdf } from './fixtures/pdf.js';
import { awaitPdfPassword, PASSWORD_NEEDED, PASSWORD_INCORRECT } from '../src/lib/pdf-password.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
  path.resolve(import.meta.dirname, '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.min.mjs'),
).href;

const FIXTURES = path.resolve(import.meta.dirname, 'fixtures', 'encrypted');
const locked = (name = 'aes256-r6.pdf') => new Uint8Array(fs.readFileSync(path.join(FIXTURES, name)));
const task = (bytes) => pdfjsLib.getDocument({ data: bytes.slice(), disableWorker: true, isEvalSupported: false });

// Fails the test instead of hanging when a promise never settles.
const within = (promise, ms = 8000) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`still waiting after ${ms} ms (hang)`)), ms)),
]);

function scriptedAsk(answers) {
  const reasons = [];
  return {
    reasons,
    ask: (reason) => { reasons.push(reason); return Promise.resolve(answers.shift() ?? null); },
  };
}

describe('awaitPdfPassword', () => {
  it('asks once and opens with the right password', async () => {
    const { ask, reasons } = scriptedAsk(['user-pw']);
    const res = await within(awaitPdfPassword(task(locked()), { ask }));
    expect(reasons).toEqual([PASSWORD_NEEDED]);
    expect(res.password).toBe('user-pw');
    expect(res.doc.numPages).toBe(2);
  });

  it('asks again after a wrong password, saying it was wrong', async () => {
    const { ask, reasons } = scriptedAsk(['wrong', 'also wrong', 'owner-pw']);
    const res = await within(awaitPdfPassword(task(locked('rc4-128-r3.pdf')), { ask }));
    expect(reasons).toEqual([PASSWORD_NEEDED, PASSWORD_INCORRECT, PASSWORD_INCORRECT]);
    expect(res.password).toBe('owner-pw');
  });

  it('cancelling ends the load (resolves null) instead of hanging', async () => {
    const { ask, reasons } = scriptedAsk([null]);
    const t = task(locked());
    const res = await within(awaitPdfPassword(t, { ask }));
    expect(res).toBeNull();
    expect(reasons).toEqual([PASSWORD_NEEDED]);
    expect(t.destroyed).toBe(true);
  });

  it('cancelling after a wrong password also ends the load', async () => {
    const { ask } = scriptedAsk(['wrong', null]);
    expect(await within(awaitPdfPassword(task(locked('aes128-r4.pdf')), { ask }))).toBeNull();
  });

  it('hides the progress UI while asking and shows it again after an answer', async () => {
    const events = [];
    const res = await within(awaitPdfPassword(task(locked()), {
      ask: () => { events.push('ask'); return Promise.resolve('user-pw'); },
      pause: () => events.push('pause'),
      resume: () => events.push('resume'),
    }));
    expect(res.doc.numPages).toBe(2);
    expect(events).toEqual(['pause', 'ask', 'resume']);
  });

  it('tries a known password silently first (reload after Save)', async () => {
    const { ask, reasons } = scriptedAsk([]);
    const res = await within(awaitPdfPassword(task(locked()), { ask, knownPassword: 'user-pw' }));
    expect(reasons).toEqual([]);
    expect(res.password).toBe('user-pw');
  });

  it('falls back to asking when the known password is stale', async () => {
    const { ask, reasons } = scriptedAsk(['user-pw']);
    const res = await within(awaitPdfPassword(task(locked()), { ask, knownPassword: 'old' }));
    expect(reasons).toEqual([PASSWORD_INCORRECT]);
    expect(res.password).toBe('user-pw');
  });

  it('a plain PDF opens without asking', async () => {
    const { ask, reasons } = scriptedAsk([]);
    const res = await within(awaitPdfPassword(task(buildPdf()), { ask }));
    expect(reasons).toEqual([]);
    expect(res.password).toBeNull();
  });

  it('owner-only protection opens without asking', async () => {
    const { ask, reasons } = scriptedAsk([]);
    const res = await within(awaitPdfPassword(task(locked('owner-only-aes256.pdf')), { ask }));
    expect(reasons).toEqual([]);
    expect((await res.doc.getMetadata()).info.EncryptFilterName).toBe('Standard');
  });

  it('a Korean password is passed through unchanged', async () => {
    const { ask } = scriptedAsk(['비밀번호']);
    const res = await within(awaitPdfPassword(task(locked('korean-pw-aes256.pdf')), { ask }));
    expect(res.password).toBe('비밀번호');
  });

  it('a damaged file still rejects (it is not mistaken for a cancel)', async () => {
    const { ask } = scriptedAsk([]);
    const junk = new TextEncoder().encode('%PDF-1.7\nnot really a pdf');
    await expect(within(awaitPdfPassword(task(junk), { ask }))).rejects.toThrow();
  });
});
