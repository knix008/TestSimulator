import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isClosedShape } from '../src/iconTones.js';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const shape = (tagName, d) => ({ tagName, getAttribute: () => d });

test('only closed shapes get the soft fill', () => {
  assert.equal(isClosedShape(shape('rect')), true);
  assert.equal(isClosedShape(shape('circle')), true);
  assert.equal(isClosedShape(shape('path', 'M2.2 3.4h4.2l1.3 1.5h6.1v8.4H2.2z')), true);
  assert.equal(isClosedShape(shape('path', 'M3 2.4h10v11.2H3z M5 5h2z')), true);
  assert.equal(isClosedShape(shape('path', 'M4 4l8 8M12 4 4 12')), false, 'a cross');
  assert.equal(isClosedShape(shape('path', 'M13.2 8A5.2 5.2 0 1 1 11.6 4.2')), false, 'an arc');
  assert.equal(isClosedShape(shape('path', 'M3 2h5z M9 9h3')), false, 'closed shape plus an open line');
  assert.equal(isClosedShape(shape('path', '')), false);
});

test('every toolbar, start screen and dialog button icon has a colour', () => {
  const html = read('index.html');
  const css = read('src/styles.css');
  const ids = [...html.matchAll(/<button id="([^"]+)"[^>]*>\s*<svg class="ico[ "]/g)].map((m) => m[1]);
  assert.ok(ids.length >= 25, `found ${ids.length} icon buttons`);
  for (const id of ids) {
    assert.match(css, new RegExp(`#${id} \\.ico[^{]*\\{[^}]*--tone`), `#${id} has a tone`);
  }
  for (const kind of ['png', 'jpeg', 'webp', 'bmp', 'tiff', 'svg', 'txt', 'html']) {
    assert.match(css, new RegExp(`\\[data-save="${kind}"\\] \\.ico[^{]*\\{[^}]*--tone`), `${kind} has a tone`);
  }
});

test('light themes get deeper tones than dark themes', () => {
  const css = read('src/styles.css');
  const block = (selector) => css.slice(css.indexOf(`${selector} {\r\n  --t-blue`) >= 0 ? css.indexOf(`${selector} {\r\n  --t-blue`) : css.indexOf(`${selector} {\n  --t-blue`));
  const tone = (text) => text.match(/--t-blue: (#[0-9a-f]{6})/)[1];
  const luminance = (hex) => [1, 3, 5].reduce((sum, i, k) => sum + parseInt(hex.slice(i, i + 2), 16) * [0.2126, 0.7152, 0.0722][k], 0);
  assert.ok(luminance(tone(block(':root[data-mode="light"]'))) < luminance(tone(block(':root'))));
});
