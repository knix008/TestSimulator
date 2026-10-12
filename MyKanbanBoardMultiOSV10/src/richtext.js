// Formatted card descriptions. The text is edited in place; the font family,
// size, weight and style apply only to the part selected with the mouse.
//
// The HTML is stored with the card (`descriptionHtml`, plus `description` as
// plain text for search and printing) and always passes through `sanitize`,
// which keeps a few tags and only the font properties of `style`.
import { icon } from './icons.js';
import { clampStep, stepperHtml } from './stepper.js';
import { fromPlain, sanitize, toPlain } from './domain/markup.js';

export { fromPlain, sanitize, toPlain };

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const FORMAT_SIZES = { min: 8, max: 48, step: 1 };

/**
 * The editor: a toolbar (font, size, weight, bold, italic, clear) over an
 * editable area. `text`: { font, defaultFont, size, weight, bold, italic, clear, placeholder, weights }.
 */
export function richEditorHtml({ key, html, fonts = [], text, compact = false }) {
  return `<div class="rich-editor ${compact ? 'compact' : ''}" data-rich="${escapeHtml(key)}">
    <div class="rich-toolbar" role="toolbar" aria-label="${escapeHtml(text.toolbar)}">
      <select data-rich-font title="${escapeHtml(text.font)}" aria-label="${escapeHtml(text.font)}">
        <option value="">${escapeHtml(text.font)}</option>
        ${fonts.map((family) => `<option value="${escapeHtml(family)}">${escapeHtml(family)}</option>`).join('')}
      </select>
      ${stepperHtml({ key: 'rich-size', value: 14, min: FORMAT_SIZES.min, max: FORMAT_SIZES.max, step: 1, unit: 'px', label: text.size, decreaseTip: text.smaller, increaseTip: text.larger })}
      <select data-rich-weight title="${escapeHtml(text.weight)}" aria-label="${escapeHtml(text.weight)}">
        <option value="">${escapeHtml(text.weight)}</option>
        ${text.weights.map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join('')}
      </select>
      <button type="button" class="icon-button" data-rich-cmd="bold" title="${escapeHtml(text.bold)}" aria-label="${escapeHtml(text.bold)}"><b>B</b></button>
      <button type="button" class="icon-button" data-rich-cmd="italic" title="${escapeHtml(text.italic)}" aria-label="${escapeHtml(text.italic)}"><i>I</i></button>
      <button type="button" class="icon-button" data-rich-cmd="clear" title="${escapeHtml(text.clear)}" aria-label="${escapeHtml(text.clear)}">${icon('clear')}</button>
    </div>
    <div class="rich-area" contenteditable="true" spellcheck="false" role="textbox" aria-multiline="true" data-placeholder="${escapeHtml(text.placeholder)}" title="${escapeHtml(text.placeholder)}">${sanitize(html)}</div>
  </div>`;
}

function unwrap(element) {
  const parent = element.parentNode;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  element.remove();
}

/** Wraps the selection in a span with `property: value`, removing that property inside it. */
function styleSelection(area, range, property, value) {
  if (range.collapsed || !area.contains(range.commonAncestorContainer)) return false;
  // The selection is exactly one formatted span (e.g. pressing + again): change that span.
  const node = range.commonAncestorContainer;
  const holder = (node.nodeType === 1 ? node : node.parentElement)?.closest('span');
  if (holder && area.contains(holder) && holder.textContent === range.toString()) {
    holder.style.setProperty(property, value);
    for (const inner of holder.querySelectorAll('span')) {
      inner.style.removeProperty(property);
      if (!inner.getAttribute('style')?.trim()) unwrap(inner);
    }
    return true;
  }
  const span = document.createElement('span');
  span.style.setProperty(property, value);
  span.append(range.extractContents());
  for (const inner of span.querySelectorAll('span')) {
    inner.style.removeProperty(property);
    if (!inner.getAttribute('style')?.trim()) unwrap(inner);
  }
  for (const tag of property === 'font-weight' ? span.querySelectorAll('b, strong') : property === 'font-style' ? span.querySelectorAll('i, em') : []) unwrap(tag);
  range.insertNode(span);
  const selection = window.getSelection();
  selection.removeAllRanges();
  const next = document.createRange();
  next.selectNodeContents(span);
  selection.addRange(next);
  return true;
}

function clearSelection(area, range) {
  if (range.collapsed || !area.contains(range.commonAncestorContainer)) return false;
  const holder = document.createElement('div');
  holder.append(range.extractContents());
  const plain = document.createTextNode(holder.textContent);
  range.insertNode(plain);
  return true;
}

/** The computed font of the selection start (to show in the toolbar). */
function selectionFont(area) {
  const node = window.getSelection()?.anchorNode;
  const element = node?.nodeType === 1 ? node : node?.parentElement;
  if (!element || !area.contains(element)) return null;
  const style = getComputedStyle(element);
  return { size: Math.round(parseFloat(style.fontSize)), weight: style.fontWeight, italic: style.fontStyle === 'italic' };
}

/**
 * Wires every rich editor inside `root`. `onChange(key, { html, plain })`
 * runs after each formatting step and when the text was edited (focus leaves).
 */
export function bindRichEditors(root, onChange) {
  const ranges = new WeakMap();
  const editorOf = (element) => element.closest('.rich-editor');
  const remember = () => {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const area = (node.nodeType === 1 ? node : node.parentElement)?.closest?.('.rich-area');
    if (!area || !root.contains(area)) return;
    ranges.set(area, range.cloneRange());
    const font = selectionFont(area);
    const editor = editorOf(area);
    if (font && editor) {
      const value = editor.querySelector('[data-stepper="rich-size"] .stepper-value');
      if (value && document.activeElement !== value) value.value = `${font.size}px`;
    }
  };
  document.addEventListener('selectionchange', remember);
  const emit = (editor) => {
    const area = editor.querySelector('.rich-area');
    const html = sanitize(area.innerHTML);
    onChange(editor.dataset.rich, { html: toPlain(html).trim() ? html : '', plain: toPlain(html) });
  };
  const apply = (editor, property, value) => {
    const area = editor.querySelector('.rich-area');
    const range = ranges.get(area);
    if (!range) return false;
    const done = property === 'clear' ? clearSelection(area, range) : styleSelection(area, range, property, value);
    if (done) {
      remember();
      emit(editor);
    }
    return done;
  };
  // Toolbar buttons must not take the selection away from the text.
  root.addEventListener('mousedown', (event) => {
    if (event.target.closest('.rich-toolbar button')) event.preventDefault();
  });
  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-rich-cmd]');
    if (!button) return;
    const editor = editorOf(button);
    const font = selectionFont(editor.querySelector('.rich-area'));
    if (button.dataset.richCmd === 'bold') apply(editor, 'font-weight', font && Number(font.weight) >= 600 ? '400' : '700');
    else if (button.dataset.richCmd === 'italic') apply(editor, 'font-style', font?.italic ? 'normal' : 'italic');
    else apply(editor, 'clear');
  });
  root.addEventListener('change', (event) => {
    const editor = event.target.closest('.rich-editor');
    if (!editor || !event.target.matches('[data-rich-font], [data-rich-weight]')) return;
    event.stopPropagation();
    if ('richFont' in event.target.dataset && event.target.value) apply(editor, 'font-family', `"${event.target.value.replace(/"/g, '')}"`);
    if ('richWeight' in event.target.dataset && event.target.value) apply(editor, 'font-weight', event.target.value);
    if (event.target.matches('select')) event.target.value = '';
  }, true);
  root.addEventListener('focusout', (event) => {
    if (event.target.classList?.contains('rich-area')) emit(editorOf(event.target));
  });
  // Size stepper inside the editor toolbar (the shared stepper handler ignores "rich-size").
  return {
    size(element, value) {
      const editor = editorOf(element);
      return editor ? apply(editor, 'font-size', `${clampStep(value, FORMAT_SIZES)}px`) : false;
    },
  };
}

export function richText(t, weights) {
  return {
    toolbar: t('rich.toolbar'), font: t('rich.font'), size: t('rich.size'), smaller: t('rich.smaller'), larger: t('rich.larger'), weight: t('rich.weight'),
    bold: t('rich.bold'), italic: t('rich.italic'), clear: t('rich.clear'), placeholder: t('rich.placeholder'), weights,
  };
}
