'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const trash = require('../src/main/trash');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mydockbar-trash-'));

after(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
});

/** A directory holding exactly `names`. */
function bin(label, names) {
  const dir = path.join(tmp, label);
  fs.mkdirSync(dir, { recursive: true });
  for (const name of names) fs.writeFileSync(path.join(dir, name), 'x');
  return dir;
}

describe('what counts as a deleted item', () => {
  const { isDeletedItem } = trash;

  it('counts the `$R` copy, which is the file itself', () => {
    assert.strictEqual(isDeletedItem('$RABC123.txt'), true);
  });

  it('ignores the `$I` record, which is only metadata', () => {
    // The trap this whole rule exists for: emptying the bin can leave `$I`
    // files behind, and counting those reports a full bin forever after.
    assert.strictEqual(isDeletedItem('$IABC123.txt'), false);
  });

  it('is case-insensitive about the R', () => {
    assert.strictEqual(isDeletedItem('$rABC123'), true);
  });

  it('ignores the folder\'s own bookkeeping', () => {
    assert.strictEqual(isDeletedItem('desktop.ini'), false);
  });

  it('ignores a name with nothing after the prefix', () => {
    assert.strictEqual(isDeletedItem('$R'), false);
    assert.strictEqual(isDeletedItem('$'), false);
    assert.strictEqual(isDeletedItem(''), false);
  });

  it('ignores a name that merely contains $R', () => {
    assert.strictEqual(isDeletedItem('my$Rfile.txt'), false);
  });
});

describe('scanning a bin', () => {
  const { holdsItem, isDeletedItem } = trash;

  it('says no for an empty folder', () => {
    assert.strictEqual(holdsItem(bin('empty', []), isDeletedItem), 'no');
  });

  it('says no for a folder holding only orphaned metadata', () => {
    const dir = bin('orphans', ['$IAAA.txt', '$IBBB.pdf', 'desktop.ini']);
    assert.strictEqual(holdsItem(dir, isDeletedItem), 'no');
  });

  it('says yes as soon as one real item is there', () => {
    const dir = bin('full', ['$IAAA.txt', 'desktop.ini', '$RAAA.txt']);
    assert.strictEqual(holdsItem(dir, isDeletedItem), 'yes');
  });

  it('reports a folder that is not there rather than guessing', () => {
    assert.strictEqual(holdsItem(path.join(tmp, 'never-created'), isDeletedItem), 'missing');
  });

  it('reports a file where a folder should be as refused, not as empty', () => {
    const file = path.join(tmp, 'not-a-folder');
    fs.writeFileSync(file, 'x');
    assert.strictEqual(holdsItem(file, isDeletedItem), 'denied');
  });

  it('stops at the first hit instead of walking the whole folder', () => {
    // A bin can hold tens of thousands of files; the probe runs on every
    // filesystem event, so it must not enumerate them.
    const names = ['$RAAA.txt'];
    for (let i = 0; i < 400; i += 1) names.push(`filler-${i}.txt`);
    const dir = bin('big', names);

    let seen = 0;
    const verdict = holdsItem(dir, (name) => { seen += 1; return isDeletedItem(name); });
    assert.strictEqual(verdict, 'yes');
    assert.ok(seen < names.length, `looked at ${seen} of ${names.length} entries`);
  });

  it('skips the bookkeeping Finder keeps in ~/.Trash', () => {
    const accept = (name) => !trash.MAC_IGNORED.has(name);
    assert.strictEqual(holdsItem(bin('mac-empty', ['.DS_Store', '.localized']), accept), 'no');
    assert.strictEqual(holdsItem(bin('mac-full', ['.DS_Store', 'notes.txt']), accept), 'yes');
  });
});

describe('emptying on Windows shows the progress dialog', () => {
  const { windowsEmptyLaunch } = trash;

  it('asks the shell to show progress, not to delete in silence', () => {
    const launch = windowsEmptyLaunch(null);
    const script = launch.args[launch.args.length - 1];
    assert.strictEqual(launch.windowsHide, false);
    assert.match(script, /SHEmptyRecycleBin/);
    assert.doesNotMatch(script, /Clear-RecycleBin/);
    assert.match(script, /\[int64\]0\)/);
  });

  it('owns the dialog with the dock window so it stays above the dock', () => {
    const script = windowsEmptyLaunch('-42').args.at(-1);
    assert.match(script, /\[int64\]-42\)/);
  });

  it('refuses a handle that is not a number', () => {
    const script = windowsEmptyLaunch('$(Remove-Item *)').args.at(-1);
    assert.match(script, /\[int64\]0\)/);
    assert.doesNotMatch(script, /Remove-Item/);
  });
});

describe('the state the dock is given', () => {
  it('answers with just the two facts the dock needs', async () => {
    const info = await trash.state();
    assert.strictEqual(typeof info.empty, 'boolean');
    assert.strictEqual(typeof info.known, 'boolean');
  });

  it('answers fast enough to repaint an icon with', async () => {
    await trash.state();                       // warm the SID lookup
    const started = process.hrtime.bigint();
    for (let i = 0; i < 20; i += 1) await trash.state();
    const each = Number(process.hrtime.bigint() - started) / 20 / 1e6;
    assert.ok(each < 25, `${each.toFixed(2)} ms per probe`);
  });
});

describe('watching', () => {
  it('reports the state once at the start', async () => {
    const seen = [];
    const watcher = trash.watch((info) => seen.push(info));
    await new Promise((resolve) => { setTimeout(resolve, 300); });
    watcher.stop();

    assert.strictEqual(seen.length, 1);
    assert.strictEqual(typeof seen[0].empty, 'boolean');
  });

  it('stays quiet while nothing changes', async () => {
    // The whole point of watching rather than polling: an idle bin should cost
    // nothing, and above all should not keep waking the renderer.
    const seen = [];
    const watcher = trash.watch((info) => seen.push(info));
    await new Promise((resolve) => { setTimeout(resolve, 900); });
    watcher.stop();

    assert.strictEqual(seen.length, 1, `reported ${seen.length} times while idle`);
  });

  it('can be stopped more than once', () => {
    const watcher = trash.watch(() => {});
    watcher.stop();
    assert.doesNotThrow(() => watcher.stop());
  });

  it('says nothing more once it has been stopped', async () => {
    const seen = [];
    const watcher = trash.watch((info) => seen.push(info));
    watcher.stop();
    await new Promise((resolve) => { setTimeout(resolve, 300); });
    assert.strictEqual(seen.length, 0);
  });
});
