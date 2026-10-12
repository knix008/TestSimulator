const assert = require('node:assert/strict');
const { describe, it } = require('../lib/framework');
const pkg = require('../../package.json');
const { getAppInfo } = require('../../src/api/app-info');

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

  it('points to the application icon', () => {
    assert.equal(getAppInfo().iconUrl, '/assets/icon.ico');
  });
});
