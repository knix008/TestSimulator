// @mentions: a list of people pops up while typing "@" in a comment box or the page editor,
// and mentions are highlighted where pages and comments are shown.
import { esc } from './bits.js';

// The page editor and comment boxes here, and the message box in Talk.
const TARGETS = new Set(['page-comment', 'comment-edit', 'reply-text', 'inline-text', 'page-doc', 'draft']);
let state = null;

/** Wraps every @Name of a known person in the rendered HTML (outside tags only). */
export function markMentions(html, users) {
  const names = (users || []).filter((user) => user.name && user.active !== false).map((user) => esc(user.name)).sort((a, b) => b.length - a.length);
  if (!names.length || !String(html).includes('@')) return html;
  const pattern = new RegExp(`@(${names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  return String(html).split(/(<[^>]+>)/).map((part) => (part.startsWith('<') ? part : part.replace(pattern, '<span class="mention">@$1</span>'))).join('');
}

/** The "@query" just before the caret, or null. */
function queryAt(el) {
  if (el.tagName === 'TEXTAREA') {
    const before = el.value.slice(0, el.selectionStart);
    const hit = /(^|\s)@([^\s@]{0,24})$/.exec(before);
    return hit ? { query: hit[2], length: hit[2].length + 1 } : null;
  }
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed) return null;
  const node = selection.anchorNode;
  if (!node || node.nodeType !== Node.TEXT_NODE || !el.contains(node)) return null;
  const before = node.textContent.slice(0, selection.anchorOffset);
  const hit = /(^|\s)@([^\s@]{0,24})$/.exec(before.replace(/ /g, ' '));
  return hit ? { query: hit[2], length: hit[2].length + 1, node, offset: selection.anchorOffset } : null;
}

function caretBox(el, found) {
  if (el.tagName === 'TEXTAREA' || !found.node) {
    const box = el.getBoundingClientRect();
    return { left: box.left + 12, top: box.bottom + 4 };
  }
  const range = document.createRange();
  range.setStart(found.node, Math.max(0, found.offset - found.length));
  range.setEnd(found.node, found.offset);
  const box = range.getBoundingClientRect();
  return { left: box.left, top: box.bottom + 4 };
}

function close() {
  state = null;
  const pop = document.querySelector('#mention-pop');
  if (pop) pop.hidden = true;
}

function draw() {
  let pop = document.querySelector('#mention-pop');
  if (!pop) {
    pop = document.createElement('div');
    pop.id = 'mention-pop';
    pop.className = 'mention-pop';
    pop.setAttribute('role', 'listbox');
    document.body.appendChild(pop);
    // mousedown, not click: the box being typed in keeps its focus and caret.
    pop.addEventListener('mousedown', (event) => {
      const row = event.target.closest('[data-mention]');
      if (!row || !state) return;
      event.preventDefault();
      choose(state.people.find((user) => user.id === row.dataset.mention));
    });
  }
  pop.innerHTML = state.people.map((user, at) => `<button type="button" class="mention-row${at === state.index ? ' active' : ''}" data-mention="${esc(user.id)}" role="option"><b>${esc(user.name)}</b><small>${esc([user.jobTitle, user.team].filter(Boolean).join(' · '))}</small></button>`).join('');
  pop.style.left = `${Math.min(state.at.left, window.innerWidth - 260)}px`;
  pop.style.top = `${Math.min(state.at.top, window.innerHeight - 220)}px`;
  pop.hidden = false;
}

function choose(user) {
  if (!user || !state) return close();
  const { el, found } = state;
  const text = `@${user.name} `;
  if (el.tagName === 'TEXTAREA') {
    const end = el.selectionStart;
    el.setRangeText(text, end - found.length, end, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(found.node, Math.max(0, found.offset - found.length));
    range.setEnd(found.node, found.offset);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand('insertText', false, text);
  }
  el.focus();
  close();
}

/** Starts listening; `people()` gives the active people that can be mentioned. */
export function bindMentions(people) {
  document.addEventListener('input', (event) => {
    const el = event.target?.closest?.('#page-comment, #comment-edit, #reply-text, #inline-text, #page-doc, #draft');
    if (!el || !TARGETS.has(el.id)) return;
    const found = queryAt(el);
    if (!found) return close();
    const query = found.query.toLowerCase();
    const list = (people() || []).filter((user) => user.active !== false && user.name && (!query || user.name.toLowerCase().includes(query) || String(user.login || '').toLowerCase().includes(query))).slice(0, 8);
    if (!list.length) return close();
    state = { el, found, people: list, index: 0, at: caretBox(el, found) };
    draw();
  }, true);
  document.addEventListener('keydown', (event) => {
    if (!state) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      state.index = (state.index + (event.key === 'ArrowDown' ? 1 : -1) + state.people.length) % state.people.length;
      draw();
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      choose(state.people[state.index]);
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  }, true);
  document.addEventListener('focusout', (event) => { if (state && event.target === state.el) setTimeout(close, 120); }, true);
}
