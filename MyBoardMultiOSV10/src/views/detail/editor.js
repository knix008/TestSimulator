// The Markdown text editor of the detail view (description, comments): a text box with a format bar
// (bold, italic, strike, code, lists, task, link, icon, mention, image), Write / Preview, @mention
// autocomplete of users, and pictures pasted or dropped into it uploaded as attachments and inserted.
import { icon } from '../../icons.js';
import { t } from '../../i18n.js';
import { renderMarkdown, mentionAt } from './markdown.js';
import { openPicker, closePicker, pickerFor } from './picker.js';
import { avatarHtml, esc } from './util.js';

const BAR = [
  ['bold', 'bold'], ['italic', 'italic'], ['strike', 'strike'], ['code', 'textTool'], '-',
  ['ul', 'list'], ['ol', 'menu'], ['task', 'check'], '-', ['link', 'hyperlink'], ['icon', 'iconInsert'], ['mention', 'user'], ['image', 'picture'],
];

/**
 * key: the draft key ('desc', 'comment:new', 'comment:<id>'); opts: { save, cancel, placeholder, rows, autofocus }
 * The text lives in v.drafts (survives redraws and live refreshes).
 */
export function editorHtml(v, key, { save = t('detail.save'), cancel = true, placeholder = '', rows = 5, extra = '' } = {}) {
  const text = v.drafts.get(key) ?? '';
  const preview = v.previews.has(key);
  return `<div class="dt-editor${preview ? ' previewing' : ''}" data-editor="${esc(key)}">
    <div class="dt-ed-bar" role="toolbar">
      <div class="dt-ed-tabs" role="tablist">
        <button type="button" class="dt-ed-tab${preview ? '' : ' active'}" data-act="ed-write" data-key="${esc(key)}" role="tab" aria-selected="${!preview}">${icon('edit')}<span>${esc(t('detail.ed.write'))}</span></button>
        <button type="button" class="dt-ed-tab${preview ? ' active' : ''}" data-act="ed-preview" data-key="${esc(key)}" role="tab" aria-selected="${preview}">${icon('eye')}<span>${esc(t('detail.ed.preview'))}</span></button>
      </div>
      <div class="dt-ed-tools"${preview ? ' hidden' : ''}>${BAR.map((b) => (b === '-' ? '<i class="dt-sep"></i>' : `<button type="button" class="icon-button" data-act="ed-fmt" data-fmt="${b[0]}" data-key="${esc(key)}" title="${esc(t(`detail.ed.${b[0]}`))}" aria-label="${esc(t(`detail.ed.${b[0]}`))}">${icon(b[1])}</button>`)).join('')}</div>
    </div>
    ${preview
    ? `<div class="dt-ed-preview dt-md">${text.trim() ? renderMarkdown(text, v.mdOptions()) : `<p class="muted">${esc(t('detail.ed.nothing'))}</p>`}</div>`
    : `<textarea class="dt-ed-text" data-draft="${esc(key)}" rows="${rows}" placeholder="${esc(placeholder || t('detail.ed.placeholder'))}" spellcheck="true">${esc(text)}</textarea>`}
    <div class="dt-ed-foot">
      <button type="button" class="button small primary" data-act="ed-save" data-key="${esc(key)}">${icon('check')}<span>${esc(save)}</span></button>
      ${cancel ? `<button type="button" class="button small" data-act="ed-cancel" data-key="${esc(key)}">${icon('close')}<span>${esc(t('detail.cancel'))}</span></button>` : ''}
      ${extra}
      <small class="muted dt-ed-hint">${esc(t('detail.ed.hint'))}</small>
    </div>
  </div>`;
}

const textareaOf = (v, key) => v.host.querySelector(`textarea[data-draft="${CSS.escape(key)}"]`);

/** Replaces the selection (or inserts at the caret) and keeps v.drafts in step. */
export function insertText(v, key, before, after = '', fallback = '') {
  const area = textareaOf(v, key);
  if (!area) { v.drafts.set(key, `${v.drafts.get(key) ?? ''}${before}${fallback}${after}`); return; }
  const { selectionStart: s, selectionEnd: e, value } = area;
  const chosen = value.slice(s, e) || fallback;
  area.setRangeText(`${before}${chosen}${after}`, s, e, 'end');
  if (!value.slice(s, e) && fallback) area.setSelectionRange(s + before.length, s + before.length + fallback.length);
  area.focus();
  v.drafts.set(key, area.value);
}

function prefixLines(v, key, prefix) {
  const area = textareaOf(v, key);
  if (!area) return;
  const { selectionStart: s, selectionEnd: e, value } = area;
  const lineStart = value.lastIndexOf('\n', s - 1) + 1;
  const block = value.slice(lineStart, e);
  const lines = block.split('\n').map((line, i) => (typeof prefix === 'function' ? prefix(i) : prefix) + line);
  area.setRangeText(lines.join('\n'), lineStart, e, 'end');
  area.focus();
  v.drafts.set(key, area.value);
}

/** A format-bar button. */
export async function formatAction(v, key, fmt) {
  switch (fmt) {
    case 'bold': return insertText(v, key, '**', '**', t('detail.ed.boldText'));
    case 'italic': return insertText(v, key, '*', '*', t('detail.ed.italicText'));
    case 'strike': return insertText(v, key, '~~', '~~', t('detail.ed.strikeText'));
    case 'code': return insertText(v, key, '`', '`', 'code');
    case 'ul': return prefixLines(v, key, '- ');
    case 'ol': return prefixLines(v, key, (i) => `${i + 1}. `);
    case 'task': return prefixLines(v, key, '- [ ] ');
    case 'link': return insertText(v, key, '[', '](https://)', t('detail.ed.linkText'));
    case 'mention': { insertText(v, key, '@'); return mentionInput(v, textareaOf(v, key)); }
    case 'icon': {
      const area = textareaOf(v, key);
      const range = area ? [area.selectionStart, area.selectionEnd] : null;
      const ref = await v.ctx.pickIcon('', { title: t('detail.ed.icon') });
      if (!ref) return undefined;
      const again = textareaOf(v, key);
      if (again && range) again.setSelectionRange(range[0], range[1]);
      return insertText(v, key, `:icon[${ref}]`);
    }
    case 'image': return v.chooseFiles({ accept: 'image/*', multiple: true }).then((files) => insertUploads(v, key, files));
    default: return undefined;
  }
}

/** Uploads pictures/files as attachments of the issue and inserts references to them. */
export async function insertUploads(v, key, files) {
  if (!files?.length) return;
  const uploaded = await v.uploadFiles(files);
  for (const a of uploaded) {
    const ref = /^image\//.test(a.mime) ? `![${a.fileName}](attachment:${a.id})` : `[${a.fileName}](attachment:${a.id})`;
    insertText(v, key, `${ref}\n`);
  }
}

/** Typing in the text box: @mention suggestions. */
export function mentionInput(v, area) {
  if (!area) return;
  const at = mentionAt(area.value, area.selectionStart);
  if (!at) { if (pickerFor() === `mention:${area.dataset.draft}`) closePicker(); return; }
  const q = at.query.toLowerCase();
  const users = [...v.users.values()].filter((u) => u.active !== false && (`${u.username} ${u.displayName ?? ''}`.toLowerCase().includes(q))).slice(0, 8);
  if (!users.length) { closePicker(); return; }
  openPicker(area, {
    key: `mention:${area.dataset.draft}`, search: false, keepFocus: true,
    items: users.map((u) => ({ value: u.username, label: u.displayName || u.username, hint: `@${u.username}`, iconHtml: avatarHtml(u, 18) })),
    onPick: (username) => {
      const now = textareaOf(v, area.dataset.draft) ?? area;
      const where = mentionAt(now.value, now.selectionStart) ?? at;
      now.setRangeText(`@${username} `, where.start, now.selectionStart, 'end');
      now.focus();
      v.drafts.set(now.dataset.draft, now.value);
    },
  });
  area.focus();
}
