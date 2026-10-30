// Dragging rows between the panels, and out of the window.
//
// The window takes OS file drops (Tauri dragDropEnabled), which on Windows
// turns HTML5 drag & drop off inside the page, so rows are dragged with plain
// mouse events: a press arms the drag, 5 px of travel starts it, a ghost
// follows the cursor, and App (the handler) decides what is under it.
//
// Leaving the window ends the in-page drag and hands it to App's `out`, which
// starts an OS drag (local rows straight away, server rows after a download
// to a temporary folder) so the files can land in Explorer or on the desktop.
//
//   payload: { side: 'server' | 'local', items: [{ path, name, isDir, … }] }
//   keys:    { shift, ctrl }

let handler = null;   // { hover(pt, payload, keys) → label, drop(pt, payload, keys), out(payload, keys), end() }

export function setDragHandler(h) { handler = h; }

const THRESHOLD = 5;

function keysOf(e) { return { shift: !!e.shiftKey, ctrl: !!(e.ctrlKey || e.metaKey) }; }

function outside(e) {
  return e.clientX < 0 || e.clientY < 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight;
}

function makeGhost(payload, label) {
  const el = document.createElement('div');
  el.className = 'file-drag-ghost';
  const name = document.createElement('span');
  name.className = 'fdg-name';
  name.textContent = payload.items.length === 1 ? payload.items[0].name : label(payload.items.length);
  const effect = document.createElement('span');
  effect.className = 'fdg-effect';
  el.append(name, effect);
  document.body.appendChild(el);
  return el;
}

// Called from a row's mousedown (left button). `getPayload()` is asked when the
// drag really starts; `onClick()` runs instead when the button comes up
// without a drag (the row's deferred "select only this one").
export function armRowDrag(down, getPayload, { onClick, countLabel = (n) => `${n}` } = {}) {
  const sx = down.clientX;
  const sy = down.clientY;
  let active = false;
  let payload = null;
  let ghost = null;
  let last = { x: sx, y: sy };

  const update = (x, y, keys) => {
    const label = handler ? handler.hover({ x, y }, payload, keys) : '';
    ghost.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
    ghost.querySelector('.fdg-effect').textContent = label || '';
    ghost.classList.toggle('no-drop', !label);
  };

  const finish = () => {
    document.removeEventListener('mousemove', move, true);
    document.removeEventListener('mouseup', up, true);
    document.removeEventListener('mouseout', leaveWindow, true);
    document.removeEventListener('keydown', key, true);
    document.removeEventListener('keyup', key, true);
    window.removeEventListener('blur', cancel);
    if (ghost) ghost.remove();
    document.body.classList.remove('file-dragging');
    if (active && handler) handler.end();
  };

  const goOut = (keys) => {
    const p = payload;
    finish();
    if (handler) handler.out(p, keys);
  };

  function move(e) {
    if (!active) {
      if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) < THRESHOLD) return;
      payload = getPayload();
      if (!payload || !payload.items || !payload.items.length) { finish(); return; }
      active = true;
      ghost = makeGhost(payload, countLabel);
      document.body.classList.add('file-dragging');
    }
    e.preventDefault();
    if (outside(e)) { goOut(keysOf(e)); return; }
    last = { x: e.clientX, y: e.clientY };
    update(e.clientX, e.clientY, keysOf(e));
  }

  function up(e) {
    const was = active;
    const p = payload;
    finish();
    if (was) { e.preventDefault(); if (handler) handler.drop({ x: e.clientX, y: e.clientY }, p, keysOf(e)); }
    else if (onClick) onClick();
  }

  // The cursor left the window without a move event outside it.
  function leaveWindow(e) { if (active && !e.relatedTarget) goOut(keysOf(e)); }

  // Shift / Ctrl change copy ↔ move while the cursor rests; Escape cancels.
  function key(e) {
    if (!active) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(); return; }
    if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Meta') update(last.x, last.y, keysOf(e));
  }

  function cancel() { finish(); }

  document.addEventListener('mousemove', move, true);
  document.addEventListener('mouseup', up, true);
  document.addEventListener('mouseout', leaveWindow, true);
  document.addEventListener('keydown', key, true);
  document.addEventListener('keyup', key, true);
  window.addEventListener('blur', cancel);
}

// What lies under a point: { side, dir, row } — the folder a drop lands in and
// the row to highlight (a folder row; null for the panel's own folder).
// Panels mark themselves with data-drop-side and their rows with data-path /
// data-dir; `currentDir(side)` is the panel's folder.
export function dropTargetAt(x, y, currentDir, parentOf) {
  const el = document.elementFromPoint(x, y);
  const panel = el && el.closest && el.closest('[data-drop-side]');
  if (!panel) return null;
  const side = panel.getAttribute('data-drop-side');
  const row = el.closest('[data-path]');
  if (row && panel.contains(row)) {
    const p = row.getAttribute('data-path');
    if (row.getAttribute('data-dir') === '1') return { side, dir: p, row: p };
    if (side === 'local') return { side, dir: parentOf(p), row: null };
  }
  const dir = currentDir(side);
  return dir ? { side, dir, row: null } : null;
}
