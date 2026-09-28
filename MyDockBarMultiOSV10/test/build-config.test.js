'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// Normalised: git may well have checked these out with CRLF, and every
// pattern below is written against plain newlines.
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

const YML = read('electron-builder.yml');
const SCRIPTS = JSON.parse(read('package.json')).scripts;

/** The `target:` block for one platform, as written in the YAML. */
function targetBlock(platform) {
  const open = YML.indexOf(`\n${platform}:\n`);
  assert.ok(open >= 0, `electron-builder.yml has no ${platform} section`);

  const section = YML.slice(open + 1);
  const end = /\n[a-z]+:\n/.exec(section.slice(1));
  const body = end ? section.slice(0, end.index + 1) : section;

  const targets = body.indexOf('  target:');
  assert.ok(targets >= 0, `${platform} names no targets`);
  const rest = body.slice(targets);
  const stop = /\n  [a-zA-Z]/.exec(rest.slice(10));
  return stop ? rest.slice(0, stop.index + 10) : rest;
}

describe('how long a build takes', () => {
  // Naming two architectures for one target is the single most expensive thing
  // this file can do. The config wins over the command line, so it is not just
  // that every build becomes both - electron-builder also emits a third,
  // combined installer holding the two, and compressing the payload is by far
  // the slowest step in the build. Three passes of it instead of one turned a
  // two-minute build into a six-minute one.
  for (const platform of ['win', 'mac', 'linux']) {
    it(`leaves ${platform} architectures to the command line`, () => {
      const block = targetBlock(platform);
      assert.ok(!/\barch:/.test(block),
        `${platform} pins an architecture in the config, which overrides the CLI:\n${block}`);
    });
  }

  it('has a draft build that skips compression', () => {
    assert.ok(SCRIPTS['build:fast'], 'no build:fast script');
    assert.ok(SCRIPTS['build:fast'].includes('compression=store'),
      'build:fast does not actually turn compression off');
  });

  it('has a pack-only build, for when no installer is needed at all', () => {
    assert.ok(SCRIPTS.pack && SCRIPTS.pack.includes('--dir'), 'no pack script');
  });

  it('asks for both architectures only when shipping', () => {
    for (const platform of ['win', 'mac', 'linux']) {
      const release = SCRIPTS[`release:${platform}`];
      assert.ok(release, `no release:${platform} script`);
      assert.ok(release.includes('--x64') && release.includes('--arm64'),
        `release:${platform} does not build both architectures`);

      const build = SCRIPTS[`build:${platform}`];
      assert.ok(!build.includes('--arm64'),
        `build:${platform} builds a second architecture nobody asked for`);
    }
  });

  it('only regenerates the artwork when it is stale', () => {
    // `npm run icons` rebuilds unconditionally; a build only needs it present.
    for (const name of ['pack', 'build', 'build:win', 'build:mac', 'build:linux',
      'release:win', 'release:mac', 'release:linux']) {
      assert.ok(SCRIPTS[name].includes('ensure-icons'), `${name} does not ensure the artwork`);
      assert.ok(!/\bnpm run icons\b/.test(SCRIPTS[name]),
        `${name} rebuilds all the artwork every time`);
    }
  });

  it('ships only what the app loads at runtime', () => {
    const files = YML.slice(YML.indexOf('files:'), YML.indexOf('asar:'));
    assert.ok(!/- \*\*\/\*/.test(files), 'the whole tree is being packaged');
    assert.ok(files.includes('src/**/*'), 'the sources are not packaged');
  });

  it('carries only the languages the app is translated into', () => {
    // Every extra locale is another set of Electron resources in the payload.
    const after = YML.slice(YML.indexOf('electronLanguages:'));
    const listed = [];
    for (const line of after.split('\n').slice(1)) {
      const item = /^ {2}- ([\w-]+)\s*$/.exec(line);
      if (!item) break;
      listed.push(item[1]);
    }
    assert.deepStrictEqual(listed, ['en-US', 'ko']);
  });
});

describe('what lands in the project root', () => {
  it('is never a draft build', () => {
    // A store-compressed installer is three times the size and is only ever
    // meant for a quick check; it must not replace the one you hand out.
    const source = read('scripts/copy-installer.js');
    assert.ok(/compression === 'store'/.test(source),
      'copy-installer does not recognise a draft build');
    const guard = source.slice(source.indexOf("compression === 'store'"));
    assert.ok(guard.indexOf('return []') < guard.indexOf('copyFileSync'),
      'copy-installer copies before it checks whether the build was a draft');
  });
});
