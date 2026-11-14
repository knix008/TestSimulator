// Drag silhouette: a semi-transparent copy of the dragged element (same
// size, 60 % opacity, a shadow, scale 1.02) that follows the pointer. The
// caller shows where it will land (a dashed placeholder) and dims the
// original until the drop.
//
//   const g = dragGhost(el, ev, { container });   // container: absolute inside it
//   g.move(ev); ... g.destroy();
export function dragGhost(el, ev, opts = {}) {
  const rect = el.getBoundingClientRect();
  const offX = ev.clientX - rect.left;
  const offY = ev.clientY - rect.top;
  const ghost = el.cloneNode(true);
  ghost.removeAttribute('id');
  ghost.removeAttribute('data-tour');
  ghost.removeAttribute('data-testid');
  ghost.removeAttribute('data-tour-card');
  ghost.classList.add('drag-ghost');
  ghost.setAttribute('aria-hidden', 'true');
  for (const n of ghost.querySelectorAll('[id],[data-tour],[data-testid]')) { n.removeAttribute('id'); n.removeAttribute('data-tour'); n.removeAttribute('data-testid'); }
  const container = opts.container || null;
  const s = ghost.style;
  s.position = container ? 'absolute' : 'fixed';
  s.width = `${rect.width}px`;
  s.height = `${rect.height}px`;
  s.margin = '0';
  s.boxSizing = 'border-box';
  s.pointerEvents = 'none';
  s.zIndex = '9999';
  s.opacity = '0.6';
  s.transform = 'scale(1.02)';
  s.transformOrigin = `${offX}px ${offY}px`;
  s.boxShadow = '0 14px 34px rgba(0, 0, 0, .38)';
  s.transition = 'none';
  s.gridColumn = 'auto';
  s.gridRow = 'auto';
  s.cursor = 'grabbing';
  let last = { x: ev.clientX, y: ev.clientY };
  const place = () => {
    let left = last.x - offX;
    let top = last.y - offY;
    if (opts.lockY) top = rect.top;
    if (container) {
      const c = container.getBoundingClientRect();
      left -= c.left - container.scrollLeft;
      top -= c.top - container.scrollTop;
    }
    s.left = `${left}px`;
    s.top = `${top}px`;
  };
  place();
  (container || document.body).appendChild(ghost);
  return {
    el: ghost,
    offX,
    offY,
    width: rect.width,
    height: rect.height,
    /** Top-left of the silhouette in viewport coordinates. */
    topLeft: () => ({ x: last.x - offX, y: opts.lockY ? rect.top : last.y - offY }),
    move(e) { last = { x: e.clientX, y: e.clientY }; place(); },
    refresh() { place(); },
    destroy() { ghost.remove(); },
  };
}
