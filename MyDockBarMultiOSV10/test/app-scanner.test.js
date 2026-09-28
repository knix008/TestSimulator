'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseDesktopEntry, splitExec } = require('../src/main/app-scanner');
const seed = require('../src/main/seed');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mydockbar-scanner-'));

function desktopFile(name, body) {
  const file = path.join(tmp, name);
  fs.writeFileSync(file, body, 'utf8');
  return file;
}

describe('command line splitting', () => {
  it('splits on whitespace', () => {
    assert.deepStrictEqual(splitExec('firefox --new-window'), ['firefox', '--new-window']);
  });

  it('keeps quoted arguments together', () => {
    assert.deepStrictEqual(
      splitExec('"C:\\Program Files\\App\\a.exe" --flag "two words"'),
      ['C:\\Program Files\\App\\a.exe', '--flag', 'two words'],
    );
  });

  it('handles single quotes and collapses runs of spaces', () => {
    assert.deepStrictEqual(splitExec("cmd   'one two'    three"), ['cmd', 'one two', 'three']);
  });

  it('returns an empty list for an empty string', () => {
    assert.deepStrictEqual(splitExec('   '), []);
  });
});

describe('.desktop parsing', () => {
  it('reads name, command and icon', () => {
    const file = desktopFile('firefox.desktop', [
      '[Desktop Entry]', 'Type=Application', 'Name=Firefox',
      'Exec=/usr/bin/firefox %u', 'Icon=firefox', '',
    ].join('\n'));

    const entry = parseDesktopEntry(file);
    assert.strictEqual(entry.label, 'Firefox');
    assert.strictEqual(entry.path, '/usr/bin/firefox');
    assert.strictEqual(entry.icon, 'firefox');
  });

  it('strips the field codes the spec lets launchers substitute', () => {
    const file = desktopFile('codes.desktop', [
      '[Desktop Entry]', 'Name=Thing', 'Exec=/bin/thing %F %i %c --real', '',
    ].join('\n'));
    assert.strictEqual(parseDesktopEntry(file).args, '--real');
  });

  it('ignores entries the desktop is told not to display', () => {
    const hidden = desktopFile('hidden.desktop', [
      '[Desktop Entry]', 'Name=Hidden', 'Exec=/bin/x', 'NoDisplay=true', '',
    ].join('\n'));
    assert.strictEqual(parseDesktopEntry(hidden), null);

    const gone = desktopFile('gone.desktop', [
      '[Desktop Entry]', 'Name=Gone', 'Exec=/bin/x', 'Hidden=true', '',
    ].join('\n'));
    assert.strictEqual(parseDesktopEntry(gone), null);
  });

  it('ignores entries that are not applications', () => {
    const link = desktopFile('link.desktop', [
      '[Desktop Entry]', 'Type=Link', 'Name=Site', 'URL=https://example.com', '',
    ].join('\n'));
    assert.strictEqual(parseDesktopEntry(link), null);
  });

  it('ignores keys outside the [Desktop Entry] group', () => {
    const file = desktopFile('actions.desktop', [
      '[Desktop Entry]', 'Name=Real', 'Exec=/bin/real', '',
      '[Desktop Action new]', 'Name=Decoy', 'Exec=/bin/decoy', '',
    ].join('\n'));

    const entry = parseDesktopEntry(file);
    assert.strictEqual(entry.label, 'Real');
    assert.strictEqual(entry.path, '/bin/real');
  });

  it('skips comments and blank lines', () => {
    const file = desktopFile('comments.desktop', [
      '# a comment', '', '[Desktop Entry]', '  ', '# another', 'Name=Clean', 'Exec=/bin/clean', '',
    ].join('\n'));
    assert.strictEqual(parseDesktopEntry(file).label, 'Clean');
  });

  it('returns null for a file with no Exec line', () => {
    const file = desktopFile('noexec.desktop', ['[Desktop Entry]', 'Name=Nothing', ''].join('\n'));
    assert.strictEqual(parseDesktopEntry(file), null);
  });

  it('returns null rather than throwing for a missing file', () => {
    assert.strictEqual(parseDesktopEntry(path.join(tmp, 'absent.desktop')), null);
  });
});

describe('first-run seed', () => {
  it('always ends with the dock\'s own buttons', () => {
    const items = seed.build([]);
    const specials = items.filter((item) => item.type === 'special').map((item) => item.path);
    for (const entry of seed.DEFAULTS) {
      assert.ok(specials.includes(entry.path), `${entry.path} missing from the seed`);
    }
  });

  it('includes the settings button, which must never be removable', () => {
    assert.ok(seed.DEFAULTS.some((entry) => entry.path === 'dock:settings'));
  });

  it('gives every seeded item a distinct id', () => {
    const ids = seed.build([]).map((item) => item.id);
    assert.strictEqual(new Set(ids).size, ids.length);
  });

  it('picks known applications out of a scan', () => {
    const scan = [
      { label: 'Google Chrome', path: 'C:\\chrome.exe', args: '', icon: '' },
      { label: 'Some Random Tool', path: 'C:\\rnd.exe', args: '', icon: '' },
    ];
    const labels = seed.build(scan).map((item) => item.label);
    assert.ok(labels.includes('Chrome'), 'Chrome should have been recognised');
    assert.ok(!labels.includes('Some Random Tool'), 'unknown tools should not be seeded');
  });

  it('caps how many applications it seeds', () => {
    const scan = Array.from({ length: 40 }, (_, i) => ({
      label: 'Firefox', path: `C:\\ff${i}.exe`, args: '', icon: '',
    }));
    const apps = seed.build(scan).filter((item) => item.type === 'app');
    assert.ok(apps.length <= 7, `seeded ${apps.length} applications`);
  });
});
