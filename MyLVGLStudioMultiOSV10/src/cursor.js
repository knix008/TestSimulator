// The pointer's shape while something is being dragged. A drag outlives the element it started
// on: the pointer crosses other parts of the window, and each would show its own shape.
export function setDragCursor(cursor) {
  const root = document.documentElement;
  root.style.setProperty("--drag-cursor", cursor);
  root.dataset.dragCursor = cursor;
}

export function clearDragCursor() {
  const root = document.documentElement;
  root.style.removeProperty("--drag-cursor");
  delete root.dataset.dragCursor;
}
