// Inline comments: select a passage of a page to comment on it; open comments stay highlighted
// in the text, and a highlight leads to its comment.
import { esc, icon, L } from './bits.js';

/** Text nodes under `root` with a whitespace-collapsed copy of their text and a map back to the nodes. */
function textMap(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let flat = '';
  const where = [];
  let lastSpace = true;
  let lastBlock = null;
  let lastNode = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest('pre')) continue;
    // Moving into another block (paragraph, list item, cell…) reads as a space, as a selection does.
    const block = node.parentElement?.closest('p, li, h1, h2, h3, h4, td, th, blockquote, div');
    if (lastNode && block !== lastBlock && !lastSpace) {
      flat += ' ';
      where.push({ node: lastNode, at: lastNode.textContent.length });
      lastSpace = true;
    }
    lastBlock = block;
    lastNode = node;
    const value = node.textContent;
    for (let at = 0; at < value.length; at += 1) {
      const space = /\s/.test(value[at]);
      if (space && lastSpace) continue;
      flat += space ? ' ' : value[at];
      where.push({ node, at });
      lastSpace = space;
    }
  }
  return { flat, where };
}

/** Wraps the first match of `quote` in highlight marks (one per text node it crosses). */
function markPassage(root, quote, commentId, active) {
  const wanted = String(quote || '').replace(/\s+/g, ' ').trim();
  if (!wanted) return false;
  const { flat, where } = textMap(root);
  const start = flat.indexOf(wanted);
  if (start < 0) return false;
  const end = start + wanted.length;
  const pieces = new Map();
  for (let at = start; at < end; at += 1) {
    const spot = where[at];
    if (!spot || spot.at >= spot.node.textContent.length) continue;
    const piece = pieces.get(spot.node) || { from: spot.at, to: spot.at + 1 };
    piece.from = Math.min(piece.from, spot.at);
    piece.to = Math.max(piece.to, spot.at + 1);
    pieces.set(spot.node, piece);
  }
  for (const [node, piece] of pieces) {
    const range = document.createRange();
    range.setStart(node, piece.from);
    range.setEnd(node, piece.to);
    const mark = document.createElement('mark');
    mark.className = `inline-mark${active ? ' active' : ''}`;
    mark.dataset.comment = commentId;
    mark.title = L('댓글 보기', 'Show the comment');
    try { range.surroundContents(mark); } catch { /* the passage changed under us */ }
  }
  return true;
}

/** Highlights each open inline comment's passage in the page body; returns the ids that no longer match. */
export function highlightInline(root, comments, activeId = '') {
  if (!root) return [];
  const lost = [];
  for (const comment of comments || []) {
    if (!comment.inline || comment.resolved || comment.replyTo) continue;
    if (!markPassage(root, comment.quote, comment.id, comment.id === activeId)) lost.push(comment.id);
  }
  return lost;
}

let pop = null;
let pending = null;

function hide() {
  pending = null;
  if (pop) pop.hidden = true;
}

function place(rect) {
  pop.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 340))}px`;
  pop.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - 190)}px`;
  pop.hidden = false;
}

function showButton(rect) {
  pop.className = 'inline-pop compact';
  pop.innerHTML = `<button type="button" class="small-button primary" data-inline="start">${icon('comment')}<span>${L('댓글', 'Comment')}</span></button>`;
  place(rect);
}

function showForm(rect) {
  pop.className = 'inline-pop';
  pop.innerHTML = `<blockquote>${esc(pending.quote.length > 140 ? `${pending.quote.slice(0, 140)}…` : pending.quote)}</blockquote>
    <textarea id="inline-text" rows="3" placeholder="${esc(L('이 부분에 대한 댓글. Ctrl+Enter로 남깁니다.', 'Comment on this passage. Ctrl+Enter posts it.'))}"></textarea>
    <div class="inline-pop-foot"><button type="button" class="small-button" data-inline="cancel">${icon('close')}<span>${L('취소', 'Cancel')}</span></button><button type="button" class="small-button primary" data-inline="send">${icon('comment')}<span>${L('남기기', 'Comment')}</span></button></div>`;
  place(rect);
  pop.querySelector('#inline-text').focus();
}

/**
 * Listens for selections in a page being read. `send(pageId, quote, text)` posts the comment;
 * clicking a highlight calls `focus(commentId)`.
 */
export function bindInline({ send, focus }) {
  pop = document.createElement('div');
  pop.id = 'inline-pop';
  pop.hidden = true;
  document.body.appendChild(pop);
  pop.addEventListener('mousedown', (event) => { if (event.target.closest('button')) event.preventDefault(); });
  pop.addEventListener('click', (event) => {
    const button = event.target.closest('[data-inline]');
    if (!button || !pending) return;
    if (button.dataset.inline === 'start') showForm(pending.rect);
    else if (button.dataset.inline === 'cancel') hide();
    else if (button.dataset.inline === 'send') {
      const text = pop.querySelector('#inline-text')?.value.trim();
      if (!text) return;
      const { pageId, quote } = pending;
      hide();
      window.getSelection()?.removeAllRanges();
      send(pageId, quote, text);
    }
  });
  pop.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); pop.querySelector('[data-inline="send"]')?.click(); }
    if (event.key === 'Escape') { event.stopPropagation(); hide(); }
  });
  document.addEventListener('mouseup', (event) => {
    if (pop.contains(event.target)) return;
    setTimeout(() => {
      const body = event.target.closest?.('.doc-body.reading, #page-doc');
      const selection = window.getSelection();
      const quote = selection?.toString().replace(/\s+/g, ' ').trim() || '';
      if (!body || !quote || quote.length < 2 || !selection.rangeCount || !body.contains(selection.anchorNode) || !body.contains(selection.focusNode)) {
        if (!pop.hidden && !pop.querySelector('#inline-text')) hide();
        return;
      }
      pending = { pageId: body.dataset.page, quote: quote.slice(0, 500), rect: selection.getRangeAt(0).getBoundingClientRect() };
      showButton(pending.rect);
    }, 0);
  });
  document.addEventListener('click', (event) => {
    const mark = event.target.closest?.('.inline-mark');
    if (mark) focus(mark.dataset.comment);
  });
  document.addEventListener('scroll', () => { if (pending && !pop.querySelector('#inline-text')) hide(); }, true);
}
