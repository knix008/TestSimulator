const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');
const { describe, it } = require('../lib/framework');
const pkg = require('../../package.json');
const { getAppInfo } = require('../../src/api/app-info');

function git(args) {
  return execFileSync('git', args, {
    cwd: path.join(__dirname, '../..'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

describe('Application info', () => {
  it('reports the product name, version and build number from package.json', () => {
    const info = getAppInfo();
    assert.equal(info.name, pkg.build.productName);
    assert.equal(info.version, pkg.version);
    assert.equal(info.buildNumber, String(pkg.buildNumber));
  });

  it('includes a copyright line for the current year', () => {
    assert.equal(getAppInfo().copyright, `Copyright © ${new Date().getFullYear()}`);
  });

  it('reports the current git revision as build information', () => {
    const info = getAppInfo();
    let hash = null;
    try { hash = git(['rev-parse', '--short', 'HEAD']); } catch {}
    if (!hash) {
      assert.equal(info.git, null);
      return;
    }
    assert.equal(info.git.commit, hash);
    assert.equal(info.git.branch, git(['rev-parse', '--abbrev-ref', 'HEAD']));
    assert.equal(info.git.date, git(['log', '-1', '--format=%cs']));
    assert.equal(info.git.dirty, git(['status', '--porcelain']).length > 0);
    assert.equal(typeof info.git.subject, 'string');
  });

  it('points to the application icon', () => {
    assert.equal(getAppInfo().iconUrl, '/assets/icon.ico');
  });
});
