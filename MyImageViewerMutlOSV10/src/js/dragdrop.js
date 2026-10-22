/* Drag & drop of files on the desktop (Tauri).
 *
 * The Tauri window owns the webview's OS drop target (that is how dropped files arrive
 * with their real paths), so HTML5 dragover / drop never reach the page. Dragging
 * inside the window is therefore done with pointer events:
 *
 *   inside → inside    press a thumbnail / explorer file and move: a ghost follows the
 *                      pointer; release over a folder (explorer row or folder tile) to
 *                      move the files there (Ctrl = copy). Esc cancels.
 *   inside → outside   keep dragging past the window edge: the drag becomes a real OS
 *                      file drag (electronAPI.startFileDrag → DoDragDrop), offered as copy,
 *                      so Explorer, the desktop or another app can take the files.
 *   outside → inside   the native drop (paths + position) arrives as a 'native-dragdrop'
 *                      window event from tauriAPI.js; app.js decides where it lands.
 *
 * DragDrop.init({ pathsFor(el) → [paths] | null, folderAt(el) → dir | null,
 *                 onDropInto(paths, dir, mode), ghostImage(el) → url })
 */
window.DragDrop = (() => {
  const THRESHOLD = 6;     // px of movement before a press becomes a drag
  let _o = null;
  let _press = null;       // { x, y, el, pointerId, paths }
  let _drag = null;        // { paths, ghost, target }
  let _swallowClick = false;
  let _hot = null;         // folder element highlighted (in-app drag or native drag-over)

  const enabled = () => !!(_o && window.electronAPI && typeof window.electronAPI.startFileDrag === 'function');

  function _highlight(el) {
    if (_hot === el) return;
    _hot?.classList.remove('dd-target');
    _hot = el || null;
    _hot?.classList.add('dd-target');
  }

  /** Folder element + path under a client point (null when it is not a drop folder). */
  function folderAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const hit = el && _o ? _o.folderAt(el) : null;
    return hit && hit.dir ? hit : null;
  }

  function _makeGhost(paths, el) {
    const g = document.createElement('div');
    g.className = 'dd-ghost';
    const src = _o.ghostImage ? _o.ghostImage(el) : '';
    if (src) {
      const img = document.createElement('img');
      img.crossOrigin = 'anonymous';
      img.src = src;
      img.alt = '';
      g.appendChild(img);
    } else {
      g.classList.add('no-image');
    }
    const name = document.createElement('span');
    name.className = 'dd-ghost-name';
    name.textContent = String(paths[0]).split(/[/\\]/).pop();
    g.appendChild(name);
    if (paths.length > 1) {
      const n = document.createElement('span');
      n.className = 'dd-ghost-count';
      n.textContent = String(paths.length);
      g.appendChild(n);
    }
    document.body.appendChild(g);
    return g;
  }

  function _moveGhost(x, y) {
    if (_drag?.ghost) _drag.ghost.style.transform = `translate(${x + 14}px, ${y + 12}px)`;
  }

  function _end() {
    if (_drag?.ghost) _drag.ghost.remove();
    _highlight(null);
    document.body.classList.remove('dd-dragging');
    if (_press) {
      try { document.body.releasePointerCapture(_press.pointerId); } catch { /* not captured */ }
    }
    _press = null;
    _drag = null;
  }

  function _onDown(e) {
    if (!enabled() || e.button !== 0 || e.pointerType === 'touch') return;
    const paths = _o.pathsFor(e.target);
    if (!paths || !paths.length) return;
    _press = { x: e.clientX, y: e.clientY, el: e.target, pointerId: e.pointerId, paths };
  }

  function _onMove(e) {
    if (!_press) return;
    if (!_drag) {
      if (Math.hypot(e.clientX - _press.x, e.clientY - _press.y) < THRESHOLD) return;
      if (!(e.buttons & 1)) { _press = null; return; }
      // Re-read the paths now: the press may have changed the selection
      const paths = _o.pathsFor(_press.el) || _press.paths;
      _drag = { paths, ghost: _makeGhost(paths, _press.el) };
      document.body.classList.add('dd-dragging');
      try { document.body.setPointerCapture(_press.pointerId); } catch { /* fine without */ }
      window.getSelection?.()?.removeAllRanges();
    }
    e.preventDefault();
    const out = e.clientX < 0 || e.clientY < 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight;
    if (out) { _dragOut(); return; }
    _moveGhost(e.clientX, e.clientY);
    const hit = folderAt(e.clientX, e.clientY);
    // Not into a folder that is being dragged itself
    _highlight(hit && !_drag.paths.some((p) => _same(p, hit.dir)) ? hit.el : null);
  }

  /** Past the window edge: hand over to the OS drag with the same files. */
  function _dragOut() {
    if (!_drag) return;
    const paths = _drag.paths;
    _swallowClick = true;
    _end();
    window.electronAPI.startFileDrag(paths).catch((err) => console.warn('drag-out failed:', err));
  }

  function _onUp(e) {
    if (!_press) return;
    if (!_drag) { _press = null; return; }
    e.preventDefault();
    _swallowClick = true;   // the click that ends a drag must not open / select anything
    const paths = _drag.paths;
    const hit = folderAt(e.clientX, e.clientY);
    _end();
    if (hit && !paths.some((p) => _same(p, hit.dir))) _o.onDropInto(paths, hit.dir, e.ctrlKey ? 'copy' : 'move');
  }

  const _norm = (p) => String(p || '').replace(/[\\/]+/g, '/').replace(/\/$/, '').toLowerCase();
  const _same = (a, b) => _norm(a) === _norm(b);

  function init(opts) {
    _o = opts;
    // Capture phase: the browse grid / tree handlers below must still see the press
    document.addEventListener('pointerdown', _onDown, true);
    document.addEventListener('pointermove', _onMove, true);
    document.addEventListener('pointerup', _onUp, true);
    document.addEventListener('pointercancel', () => _end(), true);
    document.addEventListener('click', (e) => {
      if (!_swallowClick) return;
      _swallowClick = false;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && _drag) { e.preventDefault(); e.stopImmediatePropagation(); _swallowClick = true; _end(); }
    }, true);
    window.addEventListener('blur', () => { if (_drag) _end(); });
    // Without pointer capture the moves stop at the edge — leaving the page also counts as out
    document.documentElement.addEventListener('pointerleave', (e) => {
      if (_drag && (e.buttons & 1)) _dragOut();
    });
  }

  /** Native drag-over from another app: highlight the folder under the pointer. */
  function hoverAt(x, y) {
    const hit = x == null ? null : folderAt(x, y);
    _highlight(hit ? hit.el : null);
    return hit;
  }

  return { init, enabled, folderAt, hoverAt, isDragging: () => !!_drag };
})();
