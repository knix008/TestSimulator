// The app's own text menu (textmenu.js): which fields it serves, which items are enabled,
// what each command does to the field and the clipboard, and where the menu opens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { icon } from '../../src/icons.js';
import { messages, setLanguage } from '../../src/i18n.js';
import { fieldItems, menuAnchor, rememberTarget, runTextCommand, selectionItems, textFieldOf } from '../../src/textmenu.js';

/** A text field good enough for textmenu.js; execCommand edits it like the browser would. */
function fakeField({ tag = 'INPUT', type = 'text', value = '', start = 0, end = 0, readOnly = false, disabled = false } = {}) {
  const log = [];
  const field = {
    tagName: tag, type, value, readOnly, disabled, selectionStart: start, selectionEnd: end, isConnected: true, focused: false,
    getAttribute: (name) => (name === 'type' ? type : null),
    closest: (selector) => (selector === 'input, textarea' ? field : null),
    focus() { field.focused = true; log.push('focus'); },
    setSelectionRange(a, b) { field.selectionStart = a; field.selectionEnd = b; },
    select() { field.selectionStart = 0; field.selectionEnd = field.value.length; log.push('select'); },
    ownerDocument: {
      execCommand(name, _ui, text) {
        log.push(`exec:${name}`);
        const a = field.selectionStart;
        const b = field.selectionEnd;
        if (name === 'delete') field.value = field.value.slice(0, a) + field.value.slice(b);
        else if (name === 'insertText') field.value = field.value.slice(0, a) + text + field.value.slice(b);
        if (name !== 'undo') field.selectionStart = field.selectionEnd = a + (name === 'insertText' ? text.length : 0);
        return true;
      },
    },
  };
  return { field, log };
}
const clipboard = (content = '') => {
  const box = { content, copies: [] };
  return { box, api: { copy: async (text) => { box.copies.push(text); box.content = text; }, read: async () => box.content } };
};
const commands = (items) => items.filter((item) => !item.separator).map((item) => [item.command, Boolean(item.disabled)]);

test('text menu: serves text inputs and textareas, not buttons, checkboxes or sliders', () => {
  for (const type of ['text', 'search', '', 'number', 'url']) assert.ok(textFieldOf(fakeField({ type }).field), type || '(no type)');
  assert.ok(textFieldOf(fakeField({ tag: 'TEXTAREA', type: '' }).field));
  for (const type of ['checkbox', 'range', 'color', 'button']) assert.equal(textFieldOf(fakeField({ type }).field), null, type);
  assert.equal(textFieldOf({ closest: () => null }), null);
  assert.equal(textFieldOf(null), null);
});

test('text menu: items, icons, shortcuts and what is enabled', () => {
  setLanguage('ko');
  const { field } = fakeField({ value: 'hello world', start: 0, end: 5 });
  rememberTarget(field);
  const items = fieldItems();
  assert.deepEqual(commands(items), [
    ['text:undo', false], ['text:cut', false], ['text:copy', false], ['text:paste', false], ['text:delete', false], ['text:select-all', false],
  ]);
  // Every item has a colour icon and a label in both languages.
  for (const item of items.filter((entry) => !entry.separator)) {
    assert.match(icon(item.icon), /data-tone="[a-z]+"/, item.command);
    assert.ok(item.label && item.hint, item.command);
  }
  for (const key of ['text.undo', 'text.cut', 'text.copy', 'text.paste', 'text.delete', 'text.selectAll', 'popup.close']) {
    for (const language of ['ko', 'en']) assert.ok(messages[language][key], `${language}: ${key}`);
  }
  // Nothing selected: cut, copy and delete are off.
  rememberTarget(fakeField({ value: 'abc', start: 1, end: 1 }).field);
  assert.deepEqual(commands(fieldItems()), [
    ['text:undo', false], ['text:cut', true], ['text:copy', true], ['text:paste', false], ['text:delete', true], ['text:select-all', false],
  ]);
  // Read-only: copy only. Empty: no select all.
  rememberTarget(fakeField({ value: 'abc', start: 0, end: 3, readOnly: true }).field);
  assert.deepEqual(commands(fieldItems()).filter(([, off]) => !off).map(([command]) => command), ['text:copy', 'text:select-all']);
  rememberTarget(fakeField({ value: '' }).field);
  assert.equal(fieldItems().find((item) => item.command === 'text:select-all').disabled, true);
});

test('text menu: cut, copy, paste, delete, select all and undo act on the remembered selection', async () => {
  const { field, log } = fakeField({ value: 'hello world', start: 6, end: 11 });
  const { box, api } = clipboard('XYZ');
  rememberTarget(field);
  // The menu window takes the focus and the field loses its selection meanwhile.
  field.setSelectionRange(0, 0);
  await runTextCommand('copy', api);
  assert.deepEqual(box.copies, ['world']);
  assert.equal(field.value, 'hello world', 'copy leaves the text');
  await runTextCommand('select-all', api);
  assert.deepEqual([field.selectionStart, field.selectionEnd], [0, 11]);
  rememberTarget(field);
  await runTextCommand('cut', api);
  assert.equal(field.value, '');
  assert.equal(box.content, 'hello world', 'cut puts it on the clipboard');
  rememberTarget(field);
  await runTextCommand('paste', api);
  assert.equal(field.value, 'hello world', 'paste puts it back');
  // Paste replaces the selection.
  field.setSelectionRange(0, 5);
  rememberTarget(field);
  box.content = 'HELLO';
  await runTextCommand('paste', api);
  assert.equal(field.value, 'HELLO world');
  field.setSelectionRange(5, 11);
  rememberTarget(field);
  await runTextCommand('delete', api);
  assert.equal(field.value, 'HELLO');
  await runTextCommand('undo', api);
  // Editing goes through execCommand, so the field's own undo history keeps working.
  assert.ok(['exec:delete', 'exec:insertText', 'exec:undo'].every((entry) => log.includes(entry)), log.join(' '));
  assert.ok(field.focused, 'the field gets the focus back');
  // Empty clipboard: paste does nothing.
  box.content = '';
  const before = field.value;
  rememberTarget(field);
  await runTextCommand('paste', api);
  assert.equal(field.value, before);
});

test('text menu: selected text outside fields gets Copy; a removed field is left alone', async () => {
  const doc = { getSelection: () => ({ toString: () => '  some guide text ' }) };
  const remembered = rememberTarget({ closest: () => null }, doc);
  assert.equal(remembered.selection, 'some guide text');
  assert.deepEqual(commands(selectionItems()), [['text:copy-selection', false]]);
  const { box, api } = clipboard();
  await runTextCommand('copy-selection', api);
  assert.deepEqual(box.copies, ['some guide text']);
  rememberTarget({ closest: () => null }, { getSelection: () => ({ toString: () => '' }) });
  assert.deepEqual(selectionItems(), [], 'nothing selected: no Copy');
  // The field went away (the page was rebuilt) before the command came back.
  const { field } = fakeField({ value: 'abc', start: 0, end: 3 });
  rememberTarget(field);
  field.isConnected = false;
  await runTextCommand('delete', api);
  assert.equal(field.value, 'abc');
});

test('text menu: opens at the pointer and stays on the screen', () => {
  const win = { screenX: 100, screenY: 50, screen: { availLeft: 0, availTop: 0, availWidth: 1920, availHeight: 1040 } };
  const items = [{ command: 'a' }, { separator: true }, { command: 'b' }];
  assert.deepEqual(menuAnchor({ clientX: 10, clientY: 20 }, items, win), { x: 110, y: 70 });
  // Near the right edge: opens to the left of the pointer. Near the bottom: above it.
  assert.deepEqual(menuAnchor({ clientX: 1800, clientY: 20 }, items, win), { x: 1900 - 250, y: 70 });
  const tall = Array.from({ length: 10 }, () => ({ command: 'x' }));
  assert.deepEqual(menuAnchor({ clientX: 10, clientY: 980 }, tall, win), { x: 110, y: 1030 - (10 * 32 + 10) });
});

test('text menu: no window lets a right-click through to the native menu', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (file) => readFileSync(new URL(`../../src/${file}`, import.meta.url), 'utf8');
  for (const file of ['app.js', 'popup.js']) {
    const source = read(file);
    const handler = source.slice(source.indexOf("addEventListener('contextmenu'"));
    assert.ok(handler.length > 30, `${file}: has a contextmenu handler`);
    assert.match(handler.slice(0, 200), /event\.preventDefault\(\);/, `${file}: always prevents the native menu`);
    assert.doesNotMatch(source, /closest\('input\[type=text\], input\[type=search\], textarea'\)\) return/, `${file}: text fields no longer skip it`);
    assert.match(source, /rememberTarget\(event\.target\)/, `${file}: opens the app's text menu`);
  }
  for (const file of ['overlay.js', 'recbar.js']) assert.match(read(file), /contextmenu', \(event\) => event\.preventDefault\(\)/, `${file}: no native menu`);
});

test('text menu: a field rebuilt while the menu was open is found again', async () => {
  const old = fakeField({ value: 'hello', start: 0, end: 5 }).field;
  old.dataset = { input: 'windowFilter' };
  rememberTarget(old);
  // The list refreshed: the old field is gone, a new one with the same data-input is there.
  const fresh = fakeField({ value: 'hello', start: 0, end: 0 }).field;
  old.isConnected = false;
  let asked = '';
  old.ownerDocument = { querySelector: (selector) => { asked = selector; return fresh; } };
  const { box, api } = clipboard();
  await runTextCommand('copy', api);
  assert.equal(asked, '[data-input="windowFilter"]');
  assert.deepEqual(box.copies, ['hello'], 'copied from the remembered selection');
  assert.ok(fresh.focused, 'the new field gets the focus');
  await runTextCommand('select-all', api);
  assert.deepEqual([fresh.selectionStart, fresh.selectionEnd], [0, 5]);
});

test('text menu: paste replaces the remembered selection even if it moved while the clipboard was read', async () => {
  const { field } = fakeField({ value: 'hello world', start: 6, end: 11 });
  rememberTarget(field);
  // The clipboard read is asynchronous; meanwhile the caret went elsewhere.
  const api = { copy: async () => {}, read: async () => { field.setSelectionRange(0, 0); return 'there'; } };
  await runTextCommand('paste', api);
  assert.equal(field.value, 'hello there');
});
