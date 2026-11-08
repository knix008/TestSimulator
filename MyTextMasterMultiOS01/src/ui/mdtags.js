// The Markdown tag bar of the WYSIWYG view (under the document tabs): every element Markdown (GFM)
// can write, as buttons in groups. A button shows the Markdown it writes; pressing it applies the
// element to the selection in the page. `command` buttons go through the app's command (they ask
// for an address, a size …); the others are WYSIWYG page commands (ui/wysiwyg.js command()).
import { escapeHtml, keyLabel } from './dom.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';

export const MD_TAG_GROUPS = [
  { id: 'heading', tags: [
    { id: 'h1', icon: 'heading1', syntax: '#', key: 'Ctrl+1' },
    { id: 'h2', icon: 'heading2', syntax: '##', key: 'Ctrl+2' },
    { id: 'h3', icon: 'heading3', syntax: '###', key: 'Ctrl+3' },
    { id: 'h4', icon: 'heading', syntax: '####', key: 'Ctrl+4' },
    { id: 'h5', icon: 'heading', syntax: '#####' },
    { id: 'h6', icon: 'heading', syntax: '######' },
    { id: 'p', icon: 'textTool', syntax: '¶', key: 'Ctrl+0' },
  ] },
  { id: 'inline', tags: [
    { id: 'bold', icon: 'bold', syntax: '**B**', key: 'Ctrl+B' },
    { id: 'italic', icon: 'italic', syntax: '*I*', key: 'Ctrl+I' },
    { id: 'boldItalic', icon: 'bold', syntax: '***BI***' },
    { id: 'strike', icon: 'strike', syntax: '~~S~~', key: 'Ctrl+Shift+X' },
    { id: 'code', icon: 'codeInline', syntax: '`code`', key: 'Ctrl+`' },
    { id: 'link', icon: 'link', syntax: '[](url)', key: 'Ctrl+K', command: 'link' },
    { id: 'image', icon: 'image', syntax: '![](src)', key: 'Ctrl+Shift+I', command: 'image' },
    { id: 'br', icon: 'lineEnding', syntax: '⏎  ', key: 'Shift+Enter' },
    { id: 'clear', icon: 'clearFormat', syntax: '✕' },
  ] },
  { id: 'block', tags: [
    { id: 'ul', icon: 'listBullet', syntax: '-', key: 'Ctrl+Shift+8' },
    { id: 'ol', icon: 'listOrdered', syntax: '1.', key: 'Ctrl+Shift+7' },
    { id: 'task', icon: 'listTask', syntax: '- [ ]', key: 'Ctrl+Shift+9' },
    { id: 'quote', icon: 'quote', syntax: '>', key: 'Ctrl+Shift+Q' },
    { id: 'codeBlock', icon: 'codeBlock', syntax: '```', key: 'Ctrl+Shift+C', command: 'codeBlock' },
    { id: 'table', icon: 'tableInsert', syntax: '| |', command: 'table' },
    { id: 'hr', icon: 'horizontalRule', syntax: '---' },
  ] },
  { id: 'html', tags: [
    { id: 'kbd', icon: 'keyboard', syntax: '<kbd>' },
    { id: 'mark', icon: 'textColor', syntax: '<mark>' },
    { id: 'u', icon: 'underline', syntax: '<u>' },
    { id: 'sup', icon: 'fontSizeUp', syntax: '<sup>' },
    { id: 'sub', icon: 'fontSizeDown', syntax: '<sub>' },
  ] },
];

export const MD_TAGS = MD_TAG_GROUPS.flatMap((group) => group.tags);
export const mdTagById = (id) => MD_TAGS.find((tag) => tag.id === id);

/** The bar's HTML: groups of buttons, each with its icon and the Markdown it writes. */
export function mdTagBarHtml() {
  return `<div class="md-tagbar" role="toolbar" aria-label="${escapeHtml(t('mdtags.bar'))}">${MD_TAG_GROUPS.map((group) => `
    <div class="md-taggroup" role="group" aria-label="${escapeHtml(t(`mdtags.group.${group.id}`))}"><span class="md-taggroup-name">${escapeHtml(t(`mdtags.group.${group.id}`))}</span>
      ${group.tags.map((tag) => {
        const tip = `${t(`mdtags.${tag.id}`)} — ${tag.syntax}${tag.key ? ` (${keyLabel(tag.key)})` : ''}`;
        return `<button type="button" class="md-tag" data-md-tag="${tag.id}" title="${escapeHtml(tip)}" aria-label="${escapeHtml(t(`mdtags.${tag.id}`))}">${icon(tag.icon)}<code>${escapeHtml(tag.syntax)}</code></button>`;
      }).join('')}
    </div>`).join('')}</div>`;
}
