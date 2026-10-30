'use strict';

/** Batch processing (batch.js), vibrance and noise reduction. */
const path = require('path');

module.exports = {
  name: 'Batch processing, vibrance, noise reduction',
  run({ test, src, h }) {
    const { html, app, editor, ko, en } = src;
    const { assert, assertIncludes } = h;
    const batch = h.read('src/js/batch.js');
    const tools = h.read('src/js/editTools.js');
    const E = require(path.join(__dirname, '..', '..', 'src', 'js', 'editOps.js'));

    test('Vibrance lifts dull colours more than vivid ones; it is part of the tone pass', () => {
      const one = (rgb, o) => Array.from(E.applyTone({ width: 1, height: 1, data: Uint8ClampedArray.from([...rgb, 255]) }, o).data.slice(0, 3));
      const dull = one([140, 120, 110], { vibrance: 60 }), vivid = one([230, 40, 40], { vibrance: 60 });
      const gain = (a, b) => (Math.max(...b) - Math.min(...b)) / (Math.max(...a) - Math.min(...a));
      assert(gain([140, 120, 110], dull) > gain([230, 40, 40], vivid) * 1.3, 'dull colours gain more');
      assert(!E.toneIsIdentity({ vibrance: 10 }) && E.toneIsIdentity({ vibrance: 0 }), 'identity check');
      assertIncludes(editor, 'vibrance: effects.vibrance,', 'editor passes it');
      assertIncludes(app, "{ key:'vibrance',   label:'effects.vibrance',", 'slider');
      assert(ko['effects.vibrance'] && en['effects.vibrance'], 'strings');
    });

    test('Noise reduction smooths flat areas and keeps edges', () => {
      const w = 40, hh = 20, img = E.make(w, hh);
      let seed = 1;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
        const v = (x < 20 ? 60 : 200) + (rnd() - 0.5) * 40, i = (y * w + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
      }
      const sd = (im) => {
        const a = [];
        for (let y = 2; y < hh - 2; y++) for (let x = 2; x < 17; x++) a.push(im.data[(y * w + x) * 4]);
        const m = a.reduce((s, v) => s + v, 0) / a.length;
        return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
      };
      const out = E.denoise(img, 50);
      assert(sd(out) < sd(img) / 2.5, 'noise reduced');
      assert(out.data[(10 * w + 18) * 4] < 90 && out.data[(10 * w + 21) * 4] > 170, 'edge stays sharp');
      assertIncludes(editor, 'if (selMask) EditOps.blendByMask(workingPixels, done, selMask);', 'only the selection when there is one');
      assertIncludes(tools, "label: `${t('et.denoise')}…`", 'Image menu');
      assert(ko['et.denoise'] && en['et.denoise'], 'strings');
    });

    test('Batch: selected or whole folder, resize / convert / watermark, never overwrites, keeps photo info', () => {
      assertIncludes(html, '<div id="batch-overlay" class="dialog-overlay"', 'dialog in index.html');
      assert(html.indexOf('js/batch.js') > html.indexOf('js/editTools.js') && html.indexOf('js/batch.js') < html.indexOf('js/app.js'), 'script order');
      assertIncludes(batch, 'if (k >= 1) return canvas;', 'never enlarges');
      assertIncludes(batch, "const name = n === 1 ? `${stem}.${ext}` : `${stem} (${n}).${ext}`;", 'a free name, never replacing');
      assertIncludes(batch, 'dataUrl = await ctx.withPhotoInfo(dataUrl, { w: c.width, h: c.height }, src);', 'photo info from each original');
      assertIncludes(batch, "fc.fillStyle = '#ffffff';", 'JPEG on white');
      assertIncludes(app, 'async function _withPhotoInfo(dataUrl, { w, h } = {}, srcPath = state.currentFile) {', 'helper takes the source');
      assertIncludes(app, "{ icon: Icons.batch,      label: `${t('batch.title')}…`, action: () => _openBatch() },", 'File menu');
      assertIncludes(app, "action: () => _openBatch(printables) },", 'thumbnail right-click');
      for (const m of html.matchAll(/data-i18n="(batch\.[\w.]+)"/g)) assert(ko[m[1]] && en[m[1]], m[1]);
      for (const m of batch.matchAll(/t\('(batch\.[\w.]+)'/g)) assert(ko[m[1]] && en[m[1]], m[1]);
    });
  },
};
