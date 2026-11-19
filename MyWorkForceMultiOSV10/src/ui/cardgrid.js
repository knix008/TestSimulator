// A board of chart cards: twelve columns, rows of ROW px. Each card has a move handle (drag it onto another card
// to put it there), a corner grip (drag to resize; double-click for the default size), a "bigger" button
// (full width, first) and a hide button. The layout of each board is kept in settings.cardBoards[boardId]:
//   { order: [cardId…], size: { cardId: { w, h } }, hidden: [cardId…], max: cardId | '' }
// The pointer work happens in app.js (bindCardGrid); this module draws and holds the layout rules.
import { esc, icon, L } from './bits.js';

export const COLS = 12;
export const ROW = 30;
export const GAP = 12;

const clampW = (w) => Math.max(3, Math.min(COLS, Math.round(Number(w) || 4)));
const clampH = (h) => Math.max(5, Math.min(30, Math.round(Number(h) || 9)));

/** The board's layout with defaults filled in for its cards (in the cards' own order when none is saved). */
export function boardLayout(saved, cards) {
  const ids = cards.map((card) => card.id);
  const order = [...(saved?.order || []).filter((id) => ids.includes(id)), ...ids.filter((id) => !(saved?.order || []).includes(id))];
  const size = {};
  for (const card of cards) {
    const own = saved?.size?.[card.id];
    size[card.id] = { w: clampW(own?.w ?? card.w), h: clampH(own?.h ?? card.h) };
  }
  return { order, size, hidden: (saved?.hidden || []).filter((id) => ids.includes(id)), max: ids.includes(saved?.max) ? saved.max : '' };
}

/** Moves a card before (or after) another one. */
export function moveCard(layout, id, targetId, after = false) {
  if (!id || id === targetId) return layout;
  const order = layout.order.filter((item) => item !== id);
  let at = order.indexOf(targetId);
  if (at < 0) at = order.length; else if (after) at += 1;
  order.splice(at, 0, id);
  return { ...layout, order };
}

export function resizeCard(layout, id, w, h) {
  return { ...layout, size: { ...layout.size, [id]: { w: clampW(w), h: clampH(h) } } };
}

/**
 * The board. cards = [{ id, title, glyph, body, w, h, note? }] — w in columns (of 12), h in rows. A card's
 * body is laid out to fill the card (charts scale to it), so every card shows its chart at the card's size.
 */
export function cardGrid(ctx, boardId, cards) {
  const layout = boardLayout(ctx.settings?.cardBoards?.[boardId], cards);
  const byId = new Map(cards.map((card) => [card.id, card]));
  const shown = layout.order.filter((id) => !layout.hidden.includes(id));
  if (layout.max && shown.includes(layout.max)) shown.splice(shown.indexOf(layout.max), 1), shown.unshift(layout.max);
  const html = shown.map((id) => {
    const card = byId.get(id);
    const big = layout.max === id;
    const { w, h } = big ? { w: COLS, h: Math.max(layout.size[id].h, 14) } : layout.size[id];
    return `<section class="cg-card${big ? ' big' : ''}" data-cg-card="${esc(id)}" style="grid-column:span ${w};grid-row:span ${h}">
      <header class="cg-head">
        <span class="cg-move" data-cg-move title="${esc(L('끌어서 옮기기', 'Drag to move'))}">${icon('move')}</span>
        <b>${card.glyph ? icon(card.glyph) : ''}<span>${esc(card.title)}</span></b>${card.note ? `<small class="muted">${esc(card.note)}</small>` : ''}
        <button type="button" class="icon-button" data-action="cg-max" data-board="${esc(boardId)}" data-id="${esc(id)}" title="${esc(big ? L('원래 크기', 'Normal size') : L('크게 보기', 'Show large'))}">${icon(big ? 'restore' : 'square')}</button>
        <button type="button" class="icon-button" data-action="${card.closeAction || 'cg-hide'}" data-board="${esc(boardId)}" data-id="${esc(id)}" title="${esc(card.closeAction ? L('없애기', 'Remove') : L('숨기기', 'Hide'))}">${icon('close')}</button>
      </header>
      <div class="cg-body">${card.body}</div>
      <span class="cg-grip" data-cg-grip title="${esc(L('끌어서 크기 바꾸기 · 두 번 누르면 기본 크기', 'Drag to resize · double-click for the default size'))}"></span>
    </section>`;
  }).join('');
  const hidden = layout.hidden.map((id) => byId.get(id)).filter(Boolean);
  const tools = `<div class="cg-tools">
    ${hidden.length ? `<select data-cg-show="${esc(boardId)}"><option value="">${esc(L(`숨긴 카드 ${hidden.length}개 보이기…`, `Show a hidden card (${hidden.length})…`))}</option>${hidden.map((card) => `<option value="${esc(card.id)}">${esc(card.title)}</option>`).join('')}</select>` : ''}
    <button type="button" class="small-button" data-action="cg-reset" data-board="${esc(boardId)}" title="${esc(L('카드의 순서와 크기를 처음대로 되돌립니다.', 'Put the cards back in their first order and size.'))}">${icon('restore')}<span>${L('배치 초기화', 'Reset layout')}</span></button>
  </div>`;
  return `${tools}<div class="cg-board" data-cg-board="${esc(boardId)}" style="--cg-row:${ROW}px;--cg-gap:${GAP}px">${html}</div>`;
}
