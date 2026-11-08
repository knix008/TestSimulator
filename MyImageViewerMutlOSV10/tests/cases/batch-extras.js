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

    test('Batch shows a progress popup: true percent (no creep), time left, Stop', () => {
      assertIncludes(batch, 'modal: true, creep: false, onCancel: () => { stop = true; },', 'popup from the start, own percent, Stop');
      assertIncludes(batch, 'if (stop) break;', 'Stop ends after the current picture');
      assertIncludes(batch, "dlg.setDetail(`${t('batch.elapsed', 'Elapsed')}", 'elapsed and time left');
      assertIncludes(batch, 'new Promise((r) => setTimeout(r, 40)),', 'keeps going when frames stop (minimised)');
      assertIncludes(app, 'if (creep) dlg.startCreep(90);', 'creep can be turned off');
      assertIncludes(app, "modal: !!modal || !!document.getElementById('edit-window')?.classList.contains('visible'),", 'modal option');
      assertIncludes(html, '<button type="button" id="progress-cancel" data-i18n="progress.stop">Stop</button>', 'Stop button');
      assertIncludes(html, '<span id="progress-detail" class="progress-detail"></span>', 'detail line');
      assert(ko['progress.stop'] && en['progress.stop'] && ko['progress.stopping'] && en['progress.stopping'], 'strings');
    });

    test('Popups follow the theme: native controls and drop-down lists too', () => {
      const css = h.read('src/styles/main.css');
      assertIncludes(css, ':root { color-scheme: dark; accent-color: var(--accent); }', 'dark controls by default');
      assertIncludes(css, ':root[data-theme-kind="light"] { color-scheme: light; }', 'light themes get light controls');
      assertIncludes(css, 'select option,\r\nselect optgroup {', 'the open list of a drop-down is themed');
      assertIncludes(css, '.dialog-box :is(input[type="text"], input[type="number"], input[type="search"], input[type="password"], select, textarea) {', 'every popup input uses the theme colours');
    });

    test('Popups line up: two widths, one label | control | unit grid, OK rightmost', () => {
      const css = h.read('src/styles/main.css');
      for (const box of ['error-dialog-box', 'unsaved-dialog-box', 'rename-dialog-box', 'confirm-dialog-box', 'progress-dialog-box', 'amount-box']) {
        assert(new RegExp(`\\.dialog-box\\.${box}[,\\s][^{]*\\{ width: var\\(--dlg-w-s\\)`).test(css) || css.includes(`.dialog-box.${box},`), `${box} small width`);
      }
      assertIncludes(css, '.dialog-box.batch-box { width: var(--dlg-w-m);', 'form width');
      assertIncludes(css, 'grid-template-columns: var(--dlg-label-w) minmax(0, 1fr) var(--dlg-unit-w);', 'shared grid');
      for (const id of ['watermark-overlay', 'batch-overlay', 'canvas-size-overlay', 'amount-overlay']) {
        const start = html.indexOf(`<div id="${id}"`);
        const part = html.slice(start, html.indexOf('<div class="dialog-footer">', start));
        assert(part.includes('dlg-form') && part.includes('class="dlg-row"'), `${id} uses the form grid`);
        assert(!/<(?:label|div) class="(?:wm-field|batch-row)/.test(part), `${id} has no old ad-hoc rows`);
      }
      const r = html.indexOf('id="rename-cancel"'), o = html.indexOf('id="rename-ok"');
      assert(r > 0 && o > r, 'Rename: Cancel then Rename, like every other popup');
    });

    test('Any long work pops the progress dialog up after a moment (not only the status bar)', () => {
      assertIncludes(app, 'const LONG_MS = 800;', 'threshold');
      assertIncludes(app, 'if (_active && !_modal && !_dismissed) enableModal(', 'promotes to the popup');
      assertIncludes(app, '_dismissed = true;', 'closing it with × keeps that run in the status bar');
      assert(/function hide\(resultMessage\) \{\s*stopCreep\(\);\s*_clearLongTimer\(\);/.test(app), 'hide cancels the pending popup');
    });
  },
};
