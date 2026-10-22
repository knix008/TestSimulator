'use strict';

/** Edit window chrome: status bar, print button, File menu Print, tools. */
module.exports = {
  name: 'Edit window',
  run({ test, each, src, h }) {
    const { html, app, editor, css } = src;
    const { assert, assertIncludes } = h;

    const chrome = [
      'edit-window', 'ew-menubar', 'ew-toolbar-row', 'ew-status-bar',
      'ew-status-progress', 'ew-brand', 'edit-effects-panel', 'edit-canvas-area',
    ];
    each(chrome, (id) => `Edit chrome has #${id}`, (id) => {
      assertIncludes(html, `id="${id}"`, id);
    });

    const tools = [
      ['ew-tool-pointer', 'pointer'],
      ['ew-tool-rect', 'rect select'],
      ['ew-tool-lasso', 'lasso'],
      ['ew-tool-polygon', 'polygon'],
      ['ew-tool-magic', 'magic wand'],
      ['ew-cut', 'cut'],
      ['ew-copy', 'copy'],
      ['ew-bg-remove', 'background remove'],
      ['ew-crop-sel', 'crop selection'],
      ['ew-clear-sel', 'clear selection'],
    ];
    each(tools, ([id, label]) => `Edit tool: ${label}`, ([id]) => {
      assertIncludes(html, `id="${id}"`, id);
    });

    const transform = [
      ['ew-rotate-l', 'rotate left'],
      ['ew-rotate-r', 'rotate right'],
      ['ew-flip-h', 'flip H'],
      ['ew-flip-v', 'flip V'],
      ['ew-resize', 'resize'],
      ['ew-print', 'print'],
      ['ew-undo', 'undo'],
      ['ew-redo', 'redo'],
      ['ew-zoom-in', 'zoom in'],
      ['ew-zoom-out', 'zoom out'],
      ['ew-fit', 'fit'],
      ['ew-save', 'save'],
      ['ew-apply', 'apply'],
      ['ew-cancel', 'cancel'],
    ];
    each(transform, ([id, label]) => `Edit action: ${label}`, ([id]) => {
      assertIncludes(html, `id="${id}"`, id);
    });

    test('Theme / language / settings / about sit on the menu bar, left of the window buttons', () => {
      // Edit window: the chrome group is inside #ew-menubar, right before the window-button gutter
      const bar = html.slice(html.indexOf('<div id="ew-menubar"'), html.indexOf('<div id="ew-win-gutter">'));
      for (const id of ['ew-theme', 'ew-lang', 'ew-settings', 'ew-about']) assert(bar.includes(`id="${id}"`), `${id} on the edit menu bar`);
      assert(bar.indexOf('id="edit-window-title"') < bar.indexOf('class="ew-group ew-chrome"'), 'after the file name');
      assertIncludes(css, '#ew-menubar .ew-chrome', 'menu bar chrome style');
      // Main window: the toolbar builder sends what follows its spacer to #menubar-chrome
      const main = html.slice(html.indexOf('<div id="menubar"'), html.indexOf('<div id="win-ctrl-gutter">'));
      assert(main.includes('id="menubar-chrome"'), 'main menu bar host before the window buttons');
      assertIncludes(app, "if (chrome) { target = chrome; continue; }", 'builder targets the menu bar');
      assertIncludes(css, '.menubar-chrome {', 'menu bar chrome style (main)');
    });

    test('Save / apply / cancel / print sit left of selection tools', () => {
      const save = html.indexOf('id="ew-save"');
      const apply = html.indexOf('id="ew-apply"');
      const cancel = html.indexOf('id="ew-cancel"');
      const print = html.indexOf('id="ew-print"');
      const pointer = html.indexOf('id="ew-tool-pointer"');
      assert(save > 0 && apply > save && cancel > apply && print > cancel && pointer > print, 'file actions before tools');
    });

    test('Edit zoom controls are zoom-out, percent, zoom-in', () => {
      const out = html.indexOf('id="ew-zoom-out"');
      const pct = html.indexOf('id="ew-zoom-display"');
      const inn = html.indexOf('id="ew-zoom-in"');
      assert(out > 0 && pct > out && inn > pct, 'out → percent → in');
    });

    test('Preset panel min width follows effect labels', () => {
      assertIncludes(app, 'function _applyPresetPanelMinWidth', 'measure helper');
      assertIncludes(app, 'function _presetPanelMinWidth', 'label width');
    });

    test('Edit and main windows share the same min size', () => {
      assertIncludes(app, 'function _appMinWidth', 'shared min');
      assertIncludes(app, 'Math.max(_mainMinWidth(), _editMinWidth())', 'max of both chromes');
      const open = app.slice(app.indexOf('async function _openEditWindow'), app.indexOf('function _editWindowOpen'));
      assert(!open.includes('windowApplySize'), 'opening edit must not resize the OS window');
      const close = app.slice(app.indexOf('function _closeEditWindow'), app.indexOf('let _ewInitDone'));
      assert(!close.includes('windowApplySize'), 'closing edit must not restore a different size');
    });

    test('Edit tool change recalculates window min width', () => {
      assertIncludes(app, 'function _syncEditChromeMinSize', 'recalc helper');
      assertIncludes(app, "classList.contains('ew-actions')", 'measure action buttons');
      const block = app.slice(app.indexOf('function _ewSetTool'), app.indexOf('function _ewUpdateSelBtns'));
      assertIncludes(block, '_syncEditChromeMinSize', 'tool change updates min');
      const sync = app.slice(app.indexOf('function _syncEditChromeMinSize'), app.indexOf('function _initWindowChrome'));
      assert(!sync.includes('windowApplySize'), 'tool change must not grow the OS window');
    });

    test('Edit Print button is wired to preview', () => {
      assertIncludes(app, "'ew-print'", 'wired in action map');
      assertIncludes(app, '_openPrintPreview', 'print action');
    });

    test('Edit File menu includes Print', () => {
      assertIncludes(app, 'function _ewFileMenuItems', 'ew file menu');
      const block = app.slice(app.indexOf('function _ewFileMenuItems'), app.indexOf('function _ewEditMenuItems'));
      assertIncludes(block, "t('menu.print')", 'print in File menu');
    });

    test('Effect progress is shown on the edit status bar', () => {
      assertIncludes(app, 'function _applyEffectPreset', 'apply wrapper');
      assertIncludes(app, 'ew-status-progress', 'dual progress');
      assertIncludes(app, 'progress.effectNamed', 'named progress');
      assertIncludes(editor, 'return _requestEffectRender', 'applyPreset returns promise');
    });

    test('Edit window has in-app save / unsaved popups', () => {
      assertIncludes(html, 'id="confirm-overlay"', 'confirm overlay');
      assertIncludes(html, 'id="unsaved-overlay"', 'unsaved overlay');
      assertIncludes(html, 'id="unsaved-save"', 'unsaved save');
      assertIncludes(html, 'id="unsaved-dont"', 'unsaved dont');
      assertIncludes(html, 'id="unsaved-cancel"', 'unsaved cancel');
      assertIncludes(app, 'function _unsavedPrompt', 'unsaved prompt');
      assertIncludes(app, 'function _saveRelatedPrompt', 'save prompt');
      const close = app.slice(app.indexOf('async function _requestCloseEditWindow'), app.indexOf('function _closeEditWindow'));
      assertIncludes(close, '_unsavedPrompt', 'unsaved uses dedicated popup');
      const save = app.slice(app.indexOf('async function _saveAs('), app.indexOf('function _escHtml'));
      assertIncludes(save, '_saveRelatedPrompt', 'save success popup');
      assertIncludes(save, "force: _editWindowOpen()", 'save progress in edit window');
    });

    test('Edit image context menu can delete the file', () => {
      const block = app.slice(app.indexOf('function _showEditContextMenu'), app.indexOf('function _buildEditEffectsPanel'));
      assertIncludes(block, '_imageFileOsMenuItems', 'delete in edit context');
    });

    test('Effect apply also opens the progress popup', () => {
      const block = app.slice(app.indexOf('async function _applyEffectPreset'), app.indexOf('function _buildEffectsPanelIn'));
      assertIncludes(block, 'modal: true', 'preset apply uses modal');
      assertIncludes(app, "getElementById('progress-overlay')", 'progress overlay wired');
      assertIncludes(editor, 'inEdit || _isHeavyEffectRender()', 'edit window always shows effect popup');
      assertIncludes(editor, 'function _yieldPaint', 'paint before blocking render');
    });

    /* ── Presets / Adjustments collapse to a rail (icon + title), like the viewer panels ── */

    test('Edit panel headers carry an icon and a collapse button', () => {
      for (const id of ['edit-effects-icon', 'edit-adjust-icon', 'ew-effects-collapse-btn', 'ew-adjust-collapse-btn']) {
        assertIncludes(html, `id="${id}"`, id);
      }
      assertIncludes(app, "effectsIcon.innerHTML = Icons.layers", 'presets icon');
      assertIncludes(app, "adjustIcon.innerHTML = Icons.sliders", 'adjustments icon');
    });

    test('Edit toolbar has left / right panel toggles', () => {
      assertIncludes(html, 'id="ew-panel-left"', 'left toggle markup');
      assertIncludes(html, 'id="ew-panel-right"', 'right toggle markup');
      assertIncludes(app, "['ew-panel-left',  'panelLeft',  _ewLeftPanelTip,", 'left toggle wired');
      assertIncludes(app, "['ew-panel-right', 'panelRight', _ewRightPanelTip,", 'right toggle wired');
    });

    test('Collapsed edit panels keep icon + vertical title on a 30px rail', () => {
      assertIncludes(css, '#edit-effects-panel.collapsed > :not(.panel-header)', 'content hidden, header kept');
      assertIncludes(css, 'min-width: 30px !important;', 'beats the inline min-width');
      const rail = css.slice(css.indexOf('#edit-effects-panel.collapsed .panel-title'));
      assertIncludes(rail.slice(0, 200), 'writing-mode: vertical-rl', 'vertical title');
    });

    test('Edit panel layout is its own persisted preference, declared before init', () => {
      const declAt = app.indexOf("const EW_LAYOUT_KEY = 'editPanelLayoutV1';");
      assert(declAt > 0 && declAt < app.indexOf('\n  _buildToolbar();'), 'declared in the early block');
      assertIncludes(app, 'LAYOUT_KEY, EW_LAYOUT_KEY,', 'listed in PREF_KEYS');
      assertIncludes(app, 'checked: _ewLayout.left', 'View menu entry');
    });
  },
};
