// Text tabs above the editor, in the MyUMLMaker tab-bar style: one tab per text, a close
// button on each, "+" for a new tab and "<" ">" at the right end to scroll the strip.
//
// One <textarea> serves every tab: switching stores the text, cursor and scroll position of
// the tab being left and loads the other's. Each tab also keeps its own synthesized audio
// (waveform, playback, last save path) through hooks.captureAudio / hooks.restoreAudio.
import { icon } from './icons.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BASE_NAME = '새 텍스트';

let tabs = [];
let activeId = 0;
let nextId = 1;
let host = null;
let textarea = null;
let hooks = {};

const find = (id) => tabs.find((tab) => tab.id === id) ?? null;
export const activeTab = () => find(activeId);
export const allTabs = () => tabs.slice();

/** "새 텍스트", then "새 텍스트 2", 3 … (the lowest number not in use). */
function freshName() {
  const used = new Set(tabs.map((tab) => tab.name));
  if (!used.has(BASE_NAME)) return BASE_NAME;
  for (let n = 2; ; n += 1) if (!used.has(`${BASE_NAME} ${n}`)) return `${BASE_NAME} ${n}`;
}

/** An untouched tab: nothing typed or loaded into it, nothing synthesized. Opening a file reuses it. */
const pristine = (tab) => tab && !tab.loaded && !tab.dirty && !(tab.id === activeId ? hooks.captureAudio?.() : tab.audio)?.lastResult;

function storeActive() {
  const tab = activeTab();
  if (!tab || !textarea) return;
  tab.text = textarea.value;
  tab.selStart = textarea.selectionStart;
  tab.selEnd = textarea.selectionEnd;
  tab.scrollTop = textarea.scrollTop;
  tab.audio = hooks.captureAudio?.() ?? null;
}

function loadActive() {
  const tab = activeTab();
  if (!tab || !textarea) return;
  textarea.value = tab.text;
  textarea.setSelectionRange(tab.selStart ?? 0, tab.selEnd ?? 0);
  textarea.scrollTop = tab.scrollTop ?? 0;
  hooks.restoreAudio?.(tab.audio ?? null);
  hooks.onSwitched?.(tab);
}

// ───────────────────────── rendering

function render() {
  if (!host) return;
  const list = host.querySelector('.tab-list');
  list.innerHTML = tabs.map((tab) => `<div class="tab ${tab.id === activeId ? 'active' : ''} ${tab.dirty ? 'dirty' : ''}" role="tab" aria-selected="${tab.id === activeId}" data-doc-tab="${tab.id}" title="${escapeHtml(tab.path || tab.name)}${tab.dirty ? ' (수정됨)' : ''}">
      ${icon('ttsTextFile')}<span class="tab-name">${escapeHtml(tab.name)}</span><span class="tab-dirty">●</span>
      <button type="button" class="tab-close" data-tab-close="${tab.id}" title="탭 닫기 (Ctrl+W)" aria-label="${escapeHtml(tab.name)} 탭 닫기">${icon('close')}</button>
    </div>`).join('');
  scrollActiveIntoView();
  hooks.onChange?.(activeTab());
}

function strip() { return host?.querySelector('.tab-strip'); }

export function updateNav() {
  const s = strip();
  if (!s) return;
  const [left, right] = host.querySelectorAll('.tab-scroll');
  left.disabled = s.scrollLeft <= 0;
  right.disabled = s.scrollLeft + s.clientWidth >= s.scrollWidth - 1;
  host.classList.toggle('overflow', s.scrollWidth > s.clientWidth + 1);
}

function scrollActiveIntoView() {
  const s = strip();
  const tab = s?.querySelector('.tab.active');
  if (tab) {
    const left = tab.offsetLeft;
    const right = left + tab.offsetWidth;
    if (left < s.scrollLeft) s.scrollLeft = left;
    else if (right > s.scrollLeft + s.clientWidth) s.scrollLeft = right - s.clientWidth;
  }
  updateNav();
}

function scrollTabs(direction) {
  const s = strip();
  s.scrollBy({ left: direction * Math.max(160, s.clientWidth * 0.6), behavior: 'instant' });
  updateNav();
}

// ───────────────────────── operations

/** Switching is refused while a synthesis is running: its result belongs to the tab that asked. */
function canLeave() {
  if (hooks.canSwitch && !hooks.canSwitch()) {
    hooks.status?.('합성 중에는 탭을 바꾸거나 닫을 수 없습니다.');
    return false;
  }
  return true;
}

export function activate(id) {
  if (id === activeId || !find(id)) return false;
  if (!canLeave()) return false;
  storeActive();
  activeId = id;
  loadActive();
  render();
  return true;
}

/** A new tab (Ctrl+N, "+"); `text` and `name` for a sample or a file. */
export function newTab({ name, path = null, text = '' } = {}) {
  if (activeTab() && !canLeave()) return null;
  storeActive();
  const tab = { id: nextId++, name: name || freshName(), path, text, dirty: false, selStart: 0, selEnd: 0, scrollTop: 0, audio: null };
  tabs.push(tab);
  activeId = tab.id;
  loadActive();
  render();
  textarea?.focus();
  return tab;
}

/** A file or sample: the tab already showing that file, else an untouched tab, else a new one. */
export function openDocument({ name, path = null, text = '' }) {
  // The tab already showing it: the same file, or (samples have no file) the same name and text, unedited.
  const textOf = (tab) => (tab.id === activeId && textarea ? textarea.value : tab.text);
  const same = path
    ? tabs.find((tab) => tab.path === path)
    : tabs.find((tab) => tab.loaded && !tab.path && !tab.dirty && tab.name === name && textOf(tab) === text);
  if (same) {
    if (same.id !== activeId && !activate(same.id)) return null;
    if (!same.dirty) { same.text = text; textarea.value = text; }
    render();
    return same;
  }
  const current = activeTab();
  if (pristine(current)) {
    if (!canLeave()) return null;
    Object.assign(current, { name, path, text, loaded: true, dirty: false, selStart: 0, selEnd: 0, scrollTop: 0 });
    loadActive();
    render();
    return current;
  }
  const tab = newTab({ name, path, text });
  if (tab) tab.loaded = true;
  return tab;
}

export async function closeTab(id = activeId) {
  const tab = find(id);
  if (!tab) return;
  if (id === activeId && !canLeave()) return;
  const text = id === activeId ? textarea.value : tab.text;
  if (tab.dirty && text.trim() && hooks.confirmClose && !(await hooks.confirmClose(tab))) return;
  const index = tabs.indexOf(tab);
  if (id === activeId) {
    hooks.restoreAudio?.(null); // stops what the closing tab was playing
    tabs.splice(index, 1);
    if (!tabs.length) { activeId = 0; newTab(); return; }
    activeId = tabs[Math.min(index, tabs.length - 1)].id;
    loadActive();
  } else {
    tabs.splice(index, 1);
  }
  render();
}

/** Every tab but `id` (each modified one asks first). */
export async function closeOthers(id = activeId) {
  if (!find(id)) return;
  if (id !== activeId && !activate(id)) return;
  for (const tab of tabs.filter((t) => t.id !== id)) await closeTab(tab.id);
}

/** Ctrl+Tab / Ctrl+Shift+Tab. */
export function cycle(direction) {
  if (tabs.length < 2) return;
  const index = tabs.findIndex((tab) => tab.id === activeId);
  activate(tabs[(index + direction + tabs.length) % tabs.length].id);
}

/** The active tab got a name / file (opened, renamed) or was edited. */
export function updateActive(patch) {
  const tab = activeTab();
  if (!tab) return;
  Object.assign(tab, patch);
  render();
}

// ───────────────────────── start

export function initDocTabs(element, input, given) {
  host = element;
  textarea = input;
  hooks = given;
  host.addEventListener('click', (event) => {
    const close = event.target.closest('[data-tab-close]');
    if (close) { event.stopPropagation(); void closeTab(Number(close.dataset.tabClose)); return; }
    const scroll = event.target.closest('[data-tab-scroll]');
    if (scroll) { scrollTabs(Number(scroll.dataset.tabScroll)); return; }
    if (event.target.closest('[data-tab-add]')) { newTab(); return; }
    const tab = event.target.closest('[data-doc-tab]');
    if (tab) activate(Number(tab.dataset.docTab));
  });
  // Middle button closes, as in browsers.
  host.addEventListener('auxclick', (event) => {
    const tab = event.button === 1 && event.target.closest('[data-doc-tab]');
    if (tab) { event.preventDefault(); void closeTab(Number(tab.dataset.docTab)); }
  });
  // The wheel scrolls the strip sideways.
  strip().addEventListener('wheel', (event) => {
    if (!event.deltaY || strip().scrollWidth <= strip().clientWidth) return;
    event.preventDefault();
    strip().scrollLeft += event.deltaY;
    updateNav();
  }, { passive: false });
  strip().addEventListener('scroll', updateNav);
  window.addEventListener('resize', updateNav);
  textarea.addEventListener('input', () => {
    const tab = activeTab();
    if (tab && !tab.dirty) { tab.dirty = true; render(); }
  });
  newTab({ text: textarea.value });
}
