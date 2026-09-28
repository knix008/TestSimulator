'use strict';

/** DICOM axis rulers, the movable scale bar, DICOM thumbnails, and the chrome
 *  that has to get out of the way when the contact sheet is up. */
module.exports = {
  name: 'DICOM overlay & viewer chrome',
  run({ test, each, src, h }) {
    const { html, css, app, thumbs, contextMenu, ko, en } = src;
    const { assert, assertIncludes } = h;

    /* ── Rulers down both axes ── */

    test('Rulers are a toggle of their own', () => {
      assertIncludes(html, 'id="dcm-ruler-axes"', 'toolbar button');
      assertIncludes(app, 'function _dicomToggleRulerAxes', 'toggle');
      assertIncludes(app, "localStorage.setItem('dicomRulerAxes'", 'remembered');
      assertIncludes(app, "dcmRulerBtn?.addEventListener('click', _dicomToggleRulerAxes)", 'wired');
      assertIncludes(app, "if (e.key === 'g' || e.key === 'G')", 'shortcut G');
      assertIncludes(app, "label: t('dicom.rulerAxes')", 'context menu');
    });

    test('Rulers span the whole X and Y axes', () => {
      assertIncludes(app, 'function _dicomDrawRulerAxes', 'draw');
      const fn = app.slice(app.indexOf('function _dicomDrawRulerAxes'), app.indexOf('function _dicomDrawAnnotations'));
      assertIncludes(fn, 'ctx.fillRect(0, 0, W, band)', 'top band spans the width');
      assertIncludes(fn, 'ctx.fillRect(0, band, band, bottom - band)', 'left band spans the height');
      assertIncludes(fn, 'map.toScreen(0, 0)', 'zeroed on the image origin');
    });

    test('Tick spacing is physical when the file has a pixel spacing', () => {
      assertIncludes(app, 'function _dicomScreenUnits', 'units per screen pixel');
      assertIncludes(app, 'function _dicomTickStep', 'round step');
      assertIncludes(app, 'map.dirToImage(1, 0)', 'accounts for rotation / flip');
      // The step ladder must ascend, or `find` would pick the wrong rung.
      const m = app.match(/const steps = \[([^\]]+)\]/);
      assert(m, 'step ladder');
      const steps = m[1].split(',').map((s) => Number(s.trim()));
      assert(steps.every((n, i) => i === 0 || n > steps[i - 1]), 'ladder must ascend');
    });

    /* ── Scale bar ── */

    test('Scale bar has its own button, separate from annotations', () => {
      assertIncludes(html, 'id="dcm-scale"', 'toolbar button');
      assertIncludes(app, 'function _dicomToggleScaleBar', 'toggle');
      assertIncludes(app, "localStorage.setItem('dicomScaleBar'", 'remembered');
      assertIncludes(app, "if (e.key === 'b' || e.key === 'B')", 'shortcut B');
      assertIncludes(app, 'if (_dicomScaleOn) _dicomDrawScaleBar', 'drawn on its own flag');
      assert(!/_dicomAnnotOn\) _dicomDrawScaleBar/.test(app), 'must not ride on the annotations flag');
    });

    test('Scale bar starts top-left, is draggable and is remembered', () => {
      assertIncludes(app, 'const DCM_SCALE_HOME = { x: 0.03, y: 0.07 }', 'top-left default');
      assertIncludes(app, 'function _loadDicomScalePos', 'restore');
      assertIncludes(app, 'function _saveDicomScalePos', 'persist');
      assertIncludes(app, 'function _dicomResetScalePos', 'reset');
      assertIncludes(app, 'function _dicomScaleHitTest', 'hit test');
      assertIncludes(app, 'function _initDicomScaleDrag', 'drag');
      assertIncludes(app, '_saveDicomScalePos();', 'saved on drop');
      assertIncludes(css, '#viewer-container.dcm-scale-grab', 'move cursor');
    });

    test('The position is stored as a fraction so it survives a resize', () => {
      const fn = app.slice(app.indexOf('function _initDicomScaleDrag'), app.indexOf('function _initDicomOverlay'));
      assertIncludes(fn, '/ r.width', 'x normalised');
      assertIncludes(fn, '/ r.height', 'y normalised');
    });

    test('Dragging the bar never steals a measurement drag', () => {
      const fn = app.slice(app.indexOf('function _initDicomScaleDrag'), app.indexOf('function _initDicomOverlay'));
      assertIncludes(fn, '|| _dicomTool) return;', 'yields to the active tool');
    });

    /* ── Thumbnails for DICOM ── */

    test('Thumbnails accept a canvas, which is how DICOM decodes', () => {
      assertIncludes(thumbs, 'if (result.canvas && result.canvas.width', 'canvas source');
      assertIncludes(thumbs, "typeof src === 'string' ? await _loadImage(src) : src", 'drawn directly');
    });

    /* ── Chrome yields to the contact sheet ── */

    test('DICOM bar and overlay hide behind the contact sheet', () => {
      const fn = app.slice(app.indexOf('function _dicomHasBar'), app.indexOf('function _dicomFmt'));
      assertIncludes(fn, 'if (window.Browse?.isVisible?.()) return false;', 'gated on the sheet');
    });

    test('Media transport hides behind the contact sheet', () => {
      assertIncludes(app, "&& !window.Browse?.isVisible?.();   // the contact sheet covers the player", 'gated');
    });

    test('Showing or hiding the sheet re-syncs the viewer chrome', () => {
      const fn = app.slice(app.indexOf('function _syncBrowseChrome'), app.indexOf('function _initBrowse'));
      for (const call of ['_dicomSyncBar()', '_dicomOverlayRequest()', '_updateMediaControlsVisibility()']) {
        assertIncludes(fn, call, call);
      }
    });

    /* ── Long menus ── */

    test('A menu taller than the screen flows into columns', () => {
      assertIncludes(contextMenu, 'function _fitColumns', 'fit helper');
      assertIncludes(contextMenu, '_fitColumns(el);', 'called from _place');
      assertIncludes(contextMenu, "el.classList.add('is-columns')", 'marks the menu');
      assertIncludes(css, '#context-menu.is-columns', 'root menu css');
      assertIncludes(css, '.ctx-submenu.is-columns', 'flyout css');
      assertIncludes(css, 'column-fill: auto', 'fills each column to the set height');
    });

    /* ── Icons ── */

    each(['ruler', 'angle'], (k) => `Icon ${k} is drawn as an outline that reads at 16px`, (k) => {
      const line = src.icons.split('\n').find((l) => l.trim().startsWith(`${k}:`));
      assert(line, `${k} icon`);
      assertIncludes(line, 'stroke:currentColor', `${k} stroked`);
      assertIncludes(line, 'fill:none', `${k} not flooded by the inherited fill`);
    });

    /* ── i18n ── */

    each(['dicom.rulerAxes', 'dicom.scaleBar', 'dicom.scaleReset'],
      (k) => `i18n key ${k} in both locales`, (k) => {
        assert(typeof ko[k] === 'string' && ko[k], `ko missing ${k}`);
        assert(typeof en[k] === 'string' && en[k], `en missing ${k}`);
      });
  },
};
