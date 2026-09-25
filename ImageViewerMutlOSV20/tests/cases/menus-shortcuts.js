'use strict';

/** Menubar definitions and keyboard shortcuts. */
module.exports = {
  name: 'Menus & shortcuts',
  run({ test, each, src, h }) {
    const { app, html } = src;
    const { assertIncludes } = h;

    const menus = [
      ['_menubarDefs', 'main menubar'],
      ['_ewMenubarDefs', 'edit menubar'],
      ['_fileMenuItems', 'File'],
      ['_editMenuItems', 'Edit'],
      ['_viewMenuItems', 'View'],
      ['_effectsMenuItems', 'Effects'],
      ['_helpMenuItems', 'Help'],
      ['_themeMenuItems', 'Theme'],
      ['_langMenuItems', 'Language'],
      ['_exportMenuItems', 'Export'],
      ['_ewFileMenuItems', 'Edit File'],
      ['_ewEditMenuItems', 'Edit Edit'],
      ['_ewViewMenuItems', 'Edit View'],
    ];
    each(menus, ([fn, label]) => `Menu builder ${label}`, ([fn]) => {
      assertIncludes(app, `function ${fn}`, fn);
    });

    const keys = [
      ["e.key === 'o'", 'Ctrl+O open'],
      ["e.key === 'p'", 'Ctrl+P print'],
      ['PageUp', 'previous image'],
      ['PageDown', 'next image'],
      ["e.key === 's'", 'save'],
      ["e.key === 'z'", 'undo'],
    ];
    each(keys, ([needle, label]) => `Shortcut ${label}`, ([needle]) => {
      assertIncludes(app, needle, needle);
    });

    test('Shortcuts dialog lists keys', () => {
      assertIncludes(html, 'id="shortcuts-overlay"', 'shortcuts overlay');
    });
  },
};
