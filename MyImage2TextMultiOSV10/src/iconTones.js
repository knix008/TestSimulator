// Colourful icons. Every icon is a line drawing in its tone (--tone, set per command in
// styles.css); closed shapes (rect, circle, paths that end in "z") also get a soft fill of the
// same tone, which makes a two-tone icon. Lines and open curves keep no fill, so arrows, crosses
// and arcs do not turn into blobs. Icons added later (menus, lists) are handled as they appear.

const CLOSED_PATH = /z\s*$/i;

export function isClosedShape(element) {
  const tag = element.tagName.toLowerCase();
  if (tag === 'rect' || tag === 'circle' || tag === 'ellipse' || tag === 'polygon') return true;
  if (tag !== 'path') return false;
  // Every sub-path must be closed: "M…z M…z" fills, "M…z M…" (a closed shape plus a line) does not.
  const parts = (element.getAttribute('d') ?? '').split(/(?=[Mm])/).map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 && parts.every((part) => CLOSED_PATH.test(part));
}

export function markIcon(svg) {
  if (svg.dataset.toned) return;
  svg.dataset.toned = '1';
  for (const shape of svg.querySelectorAll('path, rect, circle, ellipse, polygon')) {
    // Shapes drawn as solid dots already set their own fill.
    if (shape.getAttribute('fill') || shape.getAttribute('stroke') === 'none') continue;
    if (isClosedShape(shape)) shape.classList.add('tone-fill');
  }
}

export function toneIcons(root = document) {
  root.querySelectorAll('svg.ico').forEach(markIcon);
}

export function watchIcons(root = document.body) {
  toneIcons(root);
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.('svg.ico')) markIcon(node);
        else if (node.querySelectorAll) toneIcons(node);
      }
    }
  }).observe(root, { childList: true, subtree: true });
}
