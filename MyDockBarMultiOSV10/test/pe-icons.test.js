'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const pe = require('../src/main/pe-icons');

const onWindows = process.platform === 'win32';
const outDir = path.join(os.tmpdir(), 'mydockbar-pe-icons-test');

/**
 * Run `fn` with `console.warn` captured rather than printed.
 *
 * The module says out loud when it cannot read a file, which is what the app
 * wants and what makes a test report look like something went wrong - the
 * unreadable file below is put there on purpose. Captured, the warning can be
 * asserted instead of merely watched scrolling past.
 */
function quietly(fn) {
  const spoken = [];
  const warn = console.warn;
  console.warn = (...args) => { spoken.push(args.join(' ')); };
  try {
    return { value: fn(), spoken: spoken.join('\n') };
  } finally {
    console.warn = warn;
  }
}

describe('PE header parsing', () => {
  it('rejects data that is not a PE file', () => {
    assert.strictEqual(pe.readHeaders(Buffer.alloc(8)), null);
    assert.strictEqual(pe.readHeaders(Buffer.from('not an executable at all, really')), null);
  });

  it('rejects a file with an MZ header but no PE signature', () => {
    const buf = Buffer.alloc(512);
    buf.write('MZ', 0);
    buf.writeUInt32LE(0x80, 0x3c);
    assert.strictEqual(pe.readHeaders(buf), null);
  });

  it('reads the resource directory out of a real executable', { skip: !onWindows }, () => {
    const headers = pe.readHeaders(fs.readFileSync(process.execPath));
    assert.ok(headers, 'no headers parsed');
    assert.ok(headers.resourceRva > 0, 'no resource directory');
    assert.ok(headers.sections.length > 0, 'no sections');
  });
});

describe('icon extraction', () => {
  it('returns an empty list rather than throwing on a missing file', () => {
    const missing = path.join(outDir, 'nope.exe');
    const { value, spoken } = quietly(() => pe.extractAll(missing, outDir));
    assert.deepStrictEqual(value, []);
    // Silently returning nothing would leave a blank icon with no way to find
    // out why, so the file it could not read has to be named.
    assert.match(spoken, /cannot read/);
    assert.ok(spoken.includes(missing), 'the warning does not say which file');
  });

  it('returns an empty list for a non-PE file', () => {
    fs.mkdirSync(outDir, { recursive: true });
    const text = path.join(outDir, 'plain.txt');
    fs.writeFileSync(text, 'hello');
    assert.deepStrictEqual(pe.extractAll(text, outDir), []);
  });

  it('pulls every icon group out of a system executable', { skip: !onWindows }, () => {
    const target = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'notepad.exe');
    if (!fs.existsSync(target)) return;

    const found = pe.extractAll(target, outDir);
    assert.ok(found.length >= 1, 'expected at least one icon group');

    for (const entry of found) {
      assert.ok(fs.existsSync(entry.file), `${entry.file} was not written`);
      const buf = fs.readFileSync(entry.file);
      // ICONDIR: reserved 0, type 1, then the image count.
      assert.strictEqual(buf.readUInt16LE(0), 0, 'bad ICO reserved field');
      assert.strictEqual(buf.readUInt16LE(2), 1, 'bad ICO type');
      assert.strictEqual(buf.readUInt16LE(4), entry.count, 'ICO count disagrees with the report');
      assert.ok(entry.size > 0, 'icon reports no size');
    }
  });

  it('follows the .mun redirect Windows uses for split system resources', { skip: !onWindows }, () => {
    const shell32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'shell32.dll');
    if (!fs.existsSync(shell32)) return;

    // shell32 is a stub on Windows 10+; its icons live in SystemResources.
    const found = pe.extractAll(shell32, outDir);
    assert.ok(found.length > 50, `expected shell32 to yield many icons, got ${found.length}`);
  });

  it('sorts the largest icons first', { skip: !onWindows }, () => {
    const target = path.join(process.env.SystemRoot || 'C:\\Windows', 'explorer.exe');
    if (!fs.existsSync(target)) return;

    const found = pe.extractAll(target, outDir);
    for (let i = 1; i < found.length; i += 1) {
      assert.ok(found[i - 1].size >= found[i].size, 'icons are not ordered by size');
    }
  });
});
