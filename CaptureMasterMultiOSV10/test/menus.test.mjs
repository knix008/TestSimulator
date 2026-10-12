import test from 'node:test';
import assert from 'node:assert/strict';
import { editMenuItems, installFallbackMenu } from '../src/lib/contextMenu.js';
import { anchorOf } from '../src/lib/popupMenu.js';

const t = (key) => key;

function field(extra) {
  return {
    tagName: 'INPUT',
    nodeType: 1,
    parentElement: null,
    getAttribute: () => 'text',
    value: 'hello',
    selectionStart: 1,
    selectionEnd: 4,
    readOnly: false,
    disabled: false,
    focus() {},
    setSelectionRange() {},
    ...extra,
  };
}

test('edit commands follow the field selection and read-only state', () => {
  const items = editMenuItems(field(), t);
  const byLabel = Object.fromEntries(items.filter((item) => item !== 'sep').map((item) => [item.label, item]));
  assert.equal(byLabel['edit.cut'].disabled, false);
  assert.equal(byLabel['edit.copy'].shortcut, 'Ctrl+C');
  assert.equal(byLabel['edit.paste'].shortcut, 'Ctrl+V');
  assert.equal(byLabel['edit.delete'].shortcut, 'Del');
  assert.equal(byLabel['edit.selectAll'].shortcut, 'Ctrl+A');
  const locked = editMenuItems(field({ readOnly: true, selectionStart: 0, selectionEnd: 0, value: '' }), t);
  const lockedByLabel = Object.fromEntries(locked.filter((item) => item !== 'sep').map((item) => [item.label, item]));
  assert.equal(lockedByLabel['edit.undo'].disabled, true);
  assert.equal(lockedByLabel['edit.cut'].disabled, true);
  assert.equal(lockedByLabel['edit.copy'].disabled, true);
  assert.equal(lockedByLabel['edit.paste'].disabled, true);
});

test('a right-click on a text field opens the edit menu', () => {
  const listeners = new Map();
  globalThis.window = {
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); },
    getSelection() { return ''; },
  };
  let opened = null;
  const off = installFallbackMenu({
    t,
    open: (x, y, items) => { opened = { x, y, items }; },
    generalItems: () => [{ label: 'settings' }],
  });
  const blocked = { defaultPrevented: true, preventDefault() {}, target: field(), clientX: 1, clientY: 2 };
  listeners.get('contextmenu')(blocked);
  assert.equal(opened, null);
  const event = {
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
    target: field(),
    clientX: 12,
    clientY: 34,
  };
  listeners.get('contextmenu')(event);
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual([opened.x, opened.y], [12, 34]);
  assert.equal(opened.items.some((item) => item && item.label === 'edit.copy'), true);
  const page = { tagName: 'DIV', nodeType: 1, parentElement: null, isContentEditable: false };
  listeners.get('contextmenu')({
    defaultPrevented: false,
    preventDefault() {},
    target: page,
    clientX: 0,
    clientY: 0,
  });
  assert.deepEqual(opened.items, [{ label: 'settings' }]);
  off();
  assert.equal(listeners.has('contextmenu'), false);
});

test('a popup anchor is the element rectangle', () => {
  const anchor = anchorOf({ getBoundingClientRect: () => ({ left: 8, top: 16, width: 40, height: 24 }) });
  assert.deepEqual(anchor, { x: 8, y: 16, w: 40, h: 24 });
});
