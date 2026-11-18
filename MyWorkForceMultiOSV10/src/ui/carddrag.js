// Moving cards on the boards and rows in the backlog with the pointer (not the browser's drag and drop, which
// WebView2 shows without a picture and which cancels when the dragged element moves). While dragging, a
// silhouette of the card follows the pointer, the card itself stays dimmed where it was, and a dashed placeholder
// of its size shows where it will land. Dropping calls onDrop(zone, orderedIds, draggedId).
//
// Markup it works with: a card or row has data-card="<issue id>"; a drop area has data-drop (with data-status
// and/or data-sprint) and holds its cards in an element with data-cards.

const START = 5;

export function bindCardDrag({ onDrop, canStart = () => true, onStart = () => {}, onEnd = () => {} }) {
  let drag = null;
  let suppressClick = false;

  document.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || drag) return;
    const card = event.target.closest?.('[data-card]');
    if (!card || card.classList.contains('start-card') || !card.closest('[data-drop]')) return;
    // Buttons, links and fields on a card keep their own clicks.
    if (event.target.closest('button, a, input, select, textarea, [contenteditable="true"]')) return;
    if (!canStart(card)) return;
    drag = { card, id: card.dataset.card, x: event.clientX, y: event.clientY, moving: false, ghost: null, holder: null, zone: null, pointerId: event.pointerId };
  });

  function begin(event) {
    const { card } = drag;
    const rect = card.getBoundingClientRect();
    drag.offsetX = event.clientX - rect.left;
    drag.offsetY = event.clientY - rect.top;
    // The silhouette: a copy of the card, half see-through, following the pointer.
    const ghost = card.cloneNode(true);
    ghost.classList.add('card-ghost');
    ghost.removeAttribute('data-card');
    ghost.removeAttribute('data-action');
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    document.body.appendChild(ghost);
    // Where it will land: a dashed box of the card's size.
    const holder = document.createElement(card.tagName === 'ARTICLE' ? 'div' : 'div');
    holder.className = 'card-placeholder';
    holder.style.height = `${rect.height}px`;
    card.after(holder);
    card.classList.add('card-dragging');
    document.body.classList.add('cards-dragging');
    drag.ghost = ghost;
    drag.holder = holder;
    drag.zone = card.closest('[data-drop]');
    drag.moving = true;
    onStart(drag.id);
  }

  function place(event) {
    const { ghost, holder } = drag;
    ghost.style.left = `${event.clientX - drag.offsetX}px`;
    ghost.style.top = `${event.clientY - drag.offsetY}px`;
    // The drop area under the pointer (the silhouette does not catch the pointer).
    const under = document.elementFromPoint(event.clientX, event.clientY);
    const zone = under?.closest?.('[data-drop]');
    for (const item of document.querySelectorAll('[data-drop].drop-over')) if (item !== zone) item.classList.remove('drop-over');
    if (!zone) return;
    zone.classList.add('drop-over');
    drag.zone = zone;
    const list = zone.querySelector('[data-cards]') || zone;
    const next = [...list.querySelectorAll('[data-card]')].find((item) => item !== drag.card && event.clientY < item.getBoundingClientRect().top + item.getBoundingClientRect().height / 2);
    if (next) { if (holder.nextElementSibling !== next) list.insertBefore(holder, next); }
    else if (holder.parentElement !== list || holder.nextElementSibling) list.appendChild(holder);
    // Near the top or bottom of a scrolling list or page: scroll along.
    const scroller = list.closest('.board-columns, .lanes, #view') || document.querySelector('#view');
    if (scroller) {
      const box = scroller.getBoundingClientRect();
      if (event.clientY < box.top + 30) scroller.scrollTop -= 12;
      else if (event.clientY > box.bottom - 30) scroller.scrollTop += 12;
      if (event.clientX < box.left + 30) scroller.scrollLeft -= 12;
      else if (event.clientX > box.right - 30) scroller.scrollLeft += 12;
    }
  }

  function finish(cancelled) {
    const current = drag;
    drag = null;
    if (!current?.moving) return;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    const { card, ghost, holder, zone, id } = current;
    ghost.remove();
    for (const item of document.querySelectorAll('[data-drop].drop-over')) item.classList.remove('drop-over');
    document.body.classList.remove('cards-dragging');
    card.classList.remove('card-dragging');
    let ids = [];
    if (!cancelled && zone && holder.parentElement) {
      // The order of the target list with the card where the placeholder is.
      ids = [...holder.parentElement.children].flatMap((node) => {
        if (node === holder) return [id];
        const other = node.dataset?.card;
        return other && other !== id ? [other] : [];
      });
    }
    holder.remove();
    onEnd(id);
    if (!cancelled && zone) onDrop(zone, ids, id);
  }

  document.addEventListener('pointermove', (event) => {
    if (!drag) return;
    if (!drag.moving) {
      if (Math.abs(event.clientX - drag.x) < START && Math.abs(event.clientY - drag.y) < START) return;
      begin(event);
    }
    event.preventDefault();
    place(event);
  });
  document.addEventListener('pointerup', () => finish(false));
  document.addEventListener('pointercancel', () => finish(true));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && drag?.moving) finish(true); });
  // The click that ends a drag does not also open the card.
  document.addEventListener('click', (event) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  return { dragging: () => Boolean(drag?.moving) };
}
