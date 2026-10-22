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

    /* ── The bar itself: two fixed rows, grouped by kind ── */

    test('DICOM bar is two rows: display on top, navigation + tools below', () => {
      assertIncludes(html, 'id="dcm-row-display"', 'top row');
      assertIncludes(html, 'id="dcm-row-tools"', 'bottom row');
      const bar = html.slice(html.indexOf('id="dicom-controls"'), html.indexOf('id="dcm-overlay"'));
      const rowDisplay = bar.indexOf('id="dcm-row-display"');
      const rowTools = bar.indexOf('id="dcm-row-tools"');
      assert(rowDisplay > -1 && rowTools > rowDisplay, 'display row comes first');
      // Window / level / colour belong to the top row …
      assert(bar.indexOf('id="dcm-window-wrap"') > rowDisplay
        && bar.indexOf('id="dcm-window-wrap"') < rowTools, 'window group on the top row');
      // … frame navigation and the measurement tools to the bottom one.
      assert(bar.indexOf('id="dcm-frames-wrap"') > rowTools, 'frames on the bottom row');
      assert(bar.indexOf('id="dcm-tools-wrap"') > rowTools, 'tools on the bottom row');
      assertIncludes(css, '.dicom-controls .dicom-row[hidden]', 'an empty row collapses');
      assertIncludes(app, "document.getElementById('dcm-row-display')?.toggleAttribute('hidden', !d.gray)",
        'top row follows the window group');
    });

    test('Bar is one line while it fits and two rows when it does not', () => {
      const rule = css.slice(css.indexOf('.dicom-controls {'), css.indexOf('.dicom-controls .dicom-row {'));
      assertIncludes(rule, 'flex-direction: row', 'one line by default');
      assertIncludes(rule, 'flex-wrap: nowrap', 'so overflow is measurable, not wrapped');
      assertIncludes(rule, 'justify-content: flex-start', 'flush left');
      assertIncludes(css, 'display: contents;', 'groups share the single line');
      const stacked = css.slice(css.indexOf('.dicom-controls.is-stacked {'), css.indexOf('.dicom-controls .dicom-row[hidden]'));
      assertIncludes(stacked, 'flex-direction: column', 'stacked rows');
      assertIncludes(stacked, 'align-items: flex-start', 'first row flush left');
      assertIncludes(stacked, 'justify-content: flex-start', 'items start at the left edge');
      assert(!/\.dicom-controls \.dicom-window \{[^}]*margin-left: auto/.test(css), 'window group never pinned right');
      // The switch is measured, not guessed from a media query on the window.
      const fn = app.slice(app.indexOf('function _dicomBarLayout'), app.indexOf('function _dicomApply'));
      assertIncludes(fn, "dicomBar.classList.remove('is-stacked')", 'measures the one-line layout');
      assertIncludes(fn, 'dicomBar.scrollWidth > dicomBar.clientWidth', 'overflow test');
      assertIncludes(fn, "dicomBar.classList.toggle('is-stacked', overflows)", 'applies the verdict');
      assertIncludes(app, '_dicomBarLayout();', 'rechecked when the viewer resizes');
      const ro = app.slice(app.indexOf('const _viewRo = new ResizeObserver'), app.indexOf('_viewRo.observe(viewerContainer)'));
      assertIncludes(ro, '_dicomBarLayout()', 'the viewer resize observer rechecks it');
    });

    test('The numbers beside the colour map carry their own label', () => {
      assertIncludes(html, 'id="dcm-range-wrap"', 'value range chunk');
      assertIncludes(html, 'data-i18n="dicom.rangeLabel"', 'range label');
      assertIncludes(html, 'id="dcm-voi-wrap"', 'VOI chunk');
      assertIncludes(html, 'data-i18n="dicom.voiLabel"', 'VOI label');
      assertIncludes(app, "document.getElementById('dcm-range-wrap')?.toggleAttribute('hidden', !d.range)",
        'range label hides with the readout');
      assertIncludes(app, "document.getElementById('dcm-voi-wrap')?.toggleAttribute('hidden', !voiFn)",
        'VOI label only when it is not LINEAR');
      assertIncludes(css, '.dicom-meta-label', 'label styling');
      for (const key of ['dicom.rangeLabel', 'dicom.rangeHint', 'dicom.voiLabel', 'dicom.voiHint']) {
        assert(ko[key] && en[key], `${key} in both locales`);
      }
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
      assertIncludes(app, 'const DCM_SCALE_PAD = 14;', 'fixed margin off the top-left corner');
      assertIncludes(app, 'leftLimit + DCM_SCALE_PAD', 'default x');
      assertIncludes(app, 'topLimit + DCM_SCALE_PAD', 'default y');
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
