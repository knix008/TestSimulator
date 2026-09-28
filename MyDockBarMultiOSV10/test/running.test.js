'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { isSystemPath, isSelf, WINDOWS_SYSTEM_PROCESSES } = require('../src/main/running');

describe('system process filtering', () => {
  it('treats binaries under the Windows directory as system', () => {
    const root = process.env.SystemRoot || 'C:\\Windows';
    assert.strictEqual(isSystemPath(path.join(root, 'explorer.exe')), true);
    assert.strictEqual(isSystemPath(path.join(root, 'System32', 'notepad.exe')), true);
  });

  it('treats installed software as a user application', () => {
    assert.strictEqual(isSystemPath('C:\\Program Files\\Google\\Chrome\\chrome.exe'), false);
    assert.strictEqual(isSystemPath('D:\\Tools\\thing.exe'), false);
  });

  it('keeps Store applications, which live under the Windows directory', () => {
    const root = process.env.SystemRoot || 'C:\\Windows';
    const store = path.join(root, 'SystemApps', 'WindowsApps', 'Some.App.exe');
    assert.strictEqual(isSystemPath(store), false);
  });

  it('is not confused by forward slashes', () => {
    const root = (process.env.SystemRoot || 'C:\\Windows').replace(/\\/g, '/');
    assert.strictEqual(isSystemPath(`${root}/System32/cmd.exe`), true);
  });

  it('handles empty and missing paths without throwing', () => {
    assert.strictEqual(isSystemPath(''), false);
    assert.strictEqual(isSystemPath(undefined), false);
  });

  it('lists the shell surfaces that own windows but are not applications', () => {
    for (const name of ['explorer', 'searchhost', 'applicationframehost', 'textinputhost']) {
      assert.ok(WINDOWS_SYSTEM_PROCESSES.has(name), `${name} should be filtered out`);
    }
  });
});

describe('excluding the dock itself', () => {
  it('recognises its own executable', () => {
    assert.strictEqual(isSelf(process.execPath), true);
  });

  it('recognises the packaged and development binaries by name', () => {
    assert.strictEqual(isSelf('C:\\Program Files\\MyDockBar\\MyDockBar.exe'), true);
    assert.strictEqual(isSelf('D:\\proj\\node_modules\\electron\\dist\\electron.exe'), true);
  });

  it('does not mistake other programs for itself', () => {
    assert.strictEqual(isSelf('C:\\Program Files\\Google\\Chrome\\chrome.exe'), false);
    assert.strictEqual(isSelf('/Applications/Safari.app'), false);
  });

  it('handles empty input', () => {
    assert.strictEqual(isSelf(''), false);
    assert.strictEqual(isSelf(null), false);
  });
});
