// Pointer drag and drop of cards (mouse, pen, touch — no HTML5 drag events, so it works the same in
// every webview and can be driven by tests with synthetic pointer events).
//
//   const drag = new CardDrag(root, scroller, {
//     ids(cardEl) → the ids that move (the selection when the card is part of it),
//     canDrop(targetCell) → true | false (a column the workflow forbids is dimmed),
//     onStart(ids, cardEl), onDrop({ ids, cell, index }), onCancel()
//   });
//
// A cell is an element with data-cell="<lane>|<column>" holding the cards (.mb-card). A collapsed column's
// cell or header (data-drop-column) takes the card to its end. While dragging, a placeholder (.bv-drop)
// shows where the card will land, the scroller scrolls near its edges, and Esc cancels.

const THRESHOLD = 5;
const EDGE = 48;

export class CardDrag {
  constructor(root, scroller, handlers) {
    this.root = root;
    this.scroller = scroller;
    this.h = handlers;
    this.state = null;
    this.suppressClick = false;
    this.onDown = this.onDown.bind(this);
    this.onMove = this.onMove.bind(this);
    this.onUp = this.onUp.bind(this);
    this.onKey = this.onKey.bind(this);
    root.addEventListener('pointerdown', this.onDown);
    // A click right after a drop is the end of the drag, not a click on the card.
    root.addEventListener('click', (event) => { if (this.suppressClick) { this.suppressClick = false; event.stopPropagation(); event.preventDefault(); } }, true);
  }

  get active() { return Boolean(this.state?.started); }

  destroy() {
    this.cancel();
    this.root.removeEventListener('pointerdown', this.onDown);
  }

  onDown(event) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const card = event.target.closest('.mb-card');
    if (!card || !this.root.contains(card) || event.target.closest('button, a, input')) return;
    this.state = { card, id: card.dataset.id, x: event.clientX, y: event.clientY, pointerId: event.pointerId, started: false };
    const doc = this.root.ownerDocument;
    doc.addEventListener('pointermove', this.onMove, true);
    doc.addEventListener('pointerup', this.onUp, true);
    doc.addEventListener('pointercancel', this.onUp, true);
  }

  start(event) {
    const s = this.state;
    s.started = true;
    s.ids = this.h.ids?.(s.card) ?? [s.id];
    const rect = s.card.getBoundingClientRect();
    s.dx = s.x - rect.left;
    s.dy = s.y - rect.top;
    s.width = rect.width;
    s.height = rect.height;
    const ghost = s.card.cloneNode(true);
    ghost.classList.add('bv-ghost');
    ghost.classList.remove('focused');
    ghost.removeAttribute('tabindex');
    ghost.style.width = `${rect.width}px`;
    if (s.ids.length > 1) ghost.insertAdjacentHTML('beforeend', `<span class="bv-ghost-count">${s.ids.length}</span>`);
    this.root.ownerDocument.body.append(ghost);
    s.ghost = ghost;
    const placeholder = this.root.ownerDocument.createElement('div');
    placeholder.className = 'bv-drop';
    placeholder.style.height = `${Math.min(rect.height, 120)}px`;
    s.placeholder = placeholder;
    for (const id of s.ids) this.root.querySelector(`.mb-card[data-id="${CSS.escape(id)}"]`)?.classList.add('dragging');
    this.root.classList.add('bv-dragging');
    this.root.ownerDocument.addEventListener('keydown', this.onKey, true);
    try { this.root.setPointerCapture?.(event.pointerId); } catch { /* synthetic events */ }
    this.h.onStart?.(s.ids, s.card);
    this.place(event.clientX, event.clientY);
  }

  onMove(event) {
    const s = this.state;
    if (!s) return;
    if (!s.started) {
      if (Math.hypot(event.clientX - s.x, event.clientY - s.y) < THRESHOLD) return;
      this.start(event);
    }
    event.preventDefault();
    s.lastX = event.clientX;
    s.lastY = event.clientY;
    this.place(event.clientX, event.clientY);
    this.autoScroll();
  }

  /** Moves the ghost and puts the placeholder where the card would land. */
  place(x, y) {
    const s = this.state;
    s.ghost.style.transform = `translate(${Math.round(x - s.dx)}px, ${Math.round(y - s.dy)}px) rotate(1.5deg)`;
    const doc = this.root.ownerDocument;
    const under = doc.elementFromPoint(x, y);
    let cell = under?.closest?.('[data-cell]');
    const columnDrop = under?.closest?.('[data-drop-column]');
    if (!cell && columnDrop) cell = this.root.querySelector(`[data-cell$="|${CSS.escape(columnDrop.dataset.dropColumn)}"]:not(.collapsed)`) ?? this.root.querySelector(`[data-cell$="|${CSS.escape(columnDrop.dataset.dropColumn)}"]`);
    if (!cell || !this.root.contains(cell)) { this.target(null); return; }
    const allowed = this.h.canDrop?.(cell) !== false;
    if (!allowed) { this.target(null, cell); return; }
    if (cell.classList.contains('collapsed') || columnDrop) {
      s.placeholder.remove();
      this.target(cell, null, Number.MAX_SAFE_INTEGER);
      return;
    }
    const cards = [...cell.querySelectorAll(':scope > .mb-card:not(.dragging)')];
    let index = cards.length;
    for (let i = 0; i < cards.length; i += 1) {
      const r = cards[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) { index = i; break; }
    }
    const before = cards[index] ?? cell.querySelector(':scope > .bv-more');
    if (before) { if (s.placeholder.nextSibling !== before || s.placeholder.parentNode !== cell) cell.insertBefore(s.placeholder, before); } else if (s.placeholder.parentNode !== cell || s.placeholder.nextSibling) cell.append(s.placeholder);
    // The index among all the cell's cards (the dragged ones left out), counting those not drawn yet.
    this.target(cell, null, index);
  }

  target(cell, refused = null, index = 0) {
    const s = this.state;
    if (s.cell && s.cell !== cell) s.cell.classList.remove('drop-target');
    if (s.refused && s.refused !== refused) s.refused.classList.remove('drop-refused');
    s.cell = cell;
    s.index = index;
    s.refused = refused;
    if (cell) cell.classList.add('drop-target'); else s.placeholder.remove();
    if (refused) refused.classList.add('drop-refused');
  }

  autoScroll() {
    const s = this.state;
    if (s.scrollTimer) return;
    const tick = () => {
      s.scrollTimer = null;
      if (!this.state?.started) return;
      const r = this.scroller.getBoundingClientRect();
      const vx = s.lastX < r.left + EDGE ? -1 : s.lastX > r.right - EDGE ? 1 : 0;
      const vy = s.lastY < r.top + EDGE ? -1 : s.lastY > r.bottom - EDGE ? 1 : 0;
      if (!vx && !vy) return;
      this.scroller.scrollBy(vx * 14, vy * 14);
      this.place(s.lastX, s.lastY);
      s.scrollTimer = requestAnimationFrame(tick);
    };
    s.scrollTimer = requestAnimationFrame(tick);
  }

  onKey(event) {
    if (event.key === 'Escape' && this.state?.started) { event.preventDefault(); event.stopPropagation(); this.cancel(); this.h.onCancel?.(); }
  }

  onUp(event) {
    const s = this.state;
    if (!s) return;
    const started = s.started;
    const drop = started && s.cell && event.type === 'pointerup' ? { ids: s.ids, cell: s.cell, index: s.index } : null;
    this.cleanup();
    if (!started) return;
    this.suppressClick = true;
    setTimeout(() => { this.suppressClick = false; }, 0);
    if (drop) this.h.onDrop?.(drop); else this.h.onCancel?.();
  }

  cancel() {
    if (!this.state) return;
    this.cleanup();
  }

  cleanup() {
    const s = this.state;
    this.state = null;
    const doc = this.root.ownerDocument;
    doc.removeEventListener('pointermove', this.onMove, true);
    doc.removeEventListener('pointerup', this.onUp, true);
    doc.removeEventListener('pointercancel', this.onUp, true);
    doc.removeEventListener('keydown', this.onKey, true);
    if (!s?.started) return;
    if (s.scrollTimer) cancelAnimationFrame(s.scrollTimer);
    s.ghost?.remove();
    s.placeholder?.remove();
    s.cell?.classList.remove('drop-target');
    s.refused?.classList.remove('drop-refused');
    for (const el of this.root.querySelectorAll('.mb-card.dragging')) el.classList.remove('dragging');
    for (const el of this.root.querySelectorAll('.no-drop')) el.classList.remove('no-drop');
    this.root.classList.remove('bv-dragging');
  }
}
