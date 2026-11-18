// Writing a page together from this side: every moment the editor's text goes to the server with the
// version it started from; what comes back (other people's changes merged in) is put into the editor
// without moving the caret off the place being typed.
import { merge3 } from '../domain/diff.js';

const EVERY = 1200;
const SOON = 300;

/** The caret as a number of characters from the start of `root`'s text. */
function caretOffset(root) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !root.contains(selection.anchorNode)) return null;
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(selection.anchorNode, selection.anchorOffset);
  return range.toString().length;
}

function placeCaret(root, offset) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let left = offset;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (left <= node.textContent.length) {
      const range = document.createRange();
      range.setStart(node, left);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    left -= node.textContent.length;
  }
}

/** Where the caret should go when the text around it changed: changes before it move it along. */
function shiftedOffset(before, after, offset) {
  let common = 0;
  while (common < before.length && common < after.length && before[common] === after[common]) common += 1;
  if (common >= offset) return offset;
  return Math.max(0, Math.min(after.length, offset + (after.length - before.length)));
}

/**
 * `read()` gives { pageId, text, title } from the open editor (or null), `write(text)` and `writeTitle(title)`
 * put text into it, `send(body)` and `leave(pageId)` reach the server, and `report(state)` hears
 * { editors, saved, revision, live } after each turn.
 */
export function createLiveWriter({ read, write, writeTitle, send, leave, report }) {
  let state = null;
  let timer = 0;
  let busy = false;
  let enabled = true;

  function schedule(delay) {
    clearTimeout(timer);
    timer = setTimeout(turn, delay);
  }

  async function turn() {
    if (!state || busy || !enabled) return;
    const mine = read();
    if (!mine || mine.pageId !== state.pageId) { stop(); return; }
    busy = true;
    try {
      const answer = await send({ pageId: state.pageId, rev: state.rev, base: state.base, text: mine.text, baseTitle: state.baseTitle, title: mine.title });
      if (!state || state.pageId !== mine.pageId) return;
      const now = read();
      if (now && answer.text !== mine.text) {
        // Others changed the page: keep what was typed while the answer travelled.
        write(now.text === mine.text ? answer.text : merge3(mine.text, now.text, answer.text).text);
      }
      if (now && answer.title !== mine.title && now.title === mine.title) writeTitle(answer.title);
      state.rev = answer.rev;
      state.base = answer.text;
      state.baseTitle = answer.title;
      report({ live: true, editors: answer.editors || [], saved: Boolean(answer.saved), revision: answer.revision || 0, error: answer.error || '', text: answer.text, title: answer.title, pageId: state.pageId });
    } catch (error) {
      const code = error?.message || '';
      // A page made a moment ago may not have reached the server yet: try a few more times.
      if (code === 'not-found' && state && (state.missing = (state.missing || 0) + 1) < 5) return;
      // An older data service, or one not reachable: this page goes back to saving on its own.
      if (['connect', 'service', 'not-found', 'permission'].includes(code) || code.startsWith('HTTP')) {
        enabled = false;
        report({ live: false, editors: [], saved: false, error: code, pageId: state?.pageId || '' });
        return;
      }
    } finally {
      busy = false;
      if (state && enabled) schedule(EVERY);
    }
  }

  function start(pageId, page) {
    if (state?.pageId === pageId) return;
    stop();
    state = { pageId, rev: 0, base: page?.body || '', baseTitle: page?.title || '' };
    schedule(50);
  }

  function stop() {
    clearTimeout(timer);
    if (!state) return;
    const { pageId } = state;
    const last = read();
    const pending = enabled && last && last.pageId === pageId && (last.text !== state.base || last.title !== state.baseTitle)
      ? send({ pageId, rev: state.rev, base: state.base, text: last.text, baseTitle: state.baseTitle, title: last.title }).catch(() => {})
      : Promise.resolve();
    state = null;
    if (enabled) pending.then(() => leave(pageId)).catch(() => {});
  }

  return {
    start,
    stop,
    /** Something was typed: send it soon. */
    nudge() { if (state && enabled) schedule(SOON); },
    get active() { return Boolean(state) && enabled; },
    get pageId() { return state?.pageId || ''; },
    get enabled() { return enabled; },
  };
}

/** Puts new text into the editor element and keeps the caret where it was typed. */
export function writeKeepingCaret(root, html, text, oldText) {
  const offset = caretOffset(root);
  root.innerHTML = html;
  if (offset != null) placeCaret(root, shiftedOffset(oldText, root.textContent, offset));
  return text;
}

export { shiftedOffset };
