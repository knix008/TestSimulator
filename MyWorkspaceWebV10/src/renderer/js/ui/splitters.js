const MIN_PANEL = 160;
const MAX_PANEL = 520;
const DRAG_THRESHOLD = 4;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isPanelCollapsed(kind) {
  if (kind === 'workspace') {
    return document.getElementById('outer-split')?.classList.contains('workspace-collapsed');
  }
  if (kind === 'outline') {
    return !document.getElementById('editor-area-split')?.classList.contains('outline-visible');
  }
  if (kind === 'comments') {
    return !document.getElementById('comments-editor-split')?.classList.contains('comments-visible');
  }
  return false;
}

function getContainerMaxWidth(splitter, reserved = 200) {
  const container = splitter.parentElement;
  if (!container) {
    return MAX_PANEL;
  }
  const available = container.getBoundingClientRect().width - reserved;
  return clamp(available, MIN_PANEL, MAX_PANEL);
}

function initSplitter(splitter, { kind, getWidth, setWidth, invertDelta = false }) {
  let activePointerId = null;
  let startPos = 0;
  let startWidth = 0;
  let moved = false;

  function endDrag(event) {
    if (activePointerId == null) {
      return;
    }
    if (event?.pointerId != null && event.pointerId !== activePointerId) {
      return;
    }

    if (splitter.hasPointerCapture?.(activePointerId)) {
      splitter.releasePointerCapture(activePointerId);
    }

    activePointerId = null;
    splitter.classList.remove('is-dragging');
    document.body.classList.remove('is-resizing');
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', endDrag, true);
    window.removeEventListener('pointercancel', endDrag, true);
    window.removeEventListener('blur', endDrag);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      endDrag();
    }
  }

  function onMove(event) {
    if (activePointerId == null || event.pointerId !== activePointerId) {
      return;
    }
    if (event.buttons === 0) {
      endDrag(event);
      return;
    }

    const rawDelta = event.clientX - startPos;
    const delta = invertDelta ? -rawDelta : rawDelta;
    if (Math.abs(rawDelta) >= DRAG_THRESHOLD) {
      moved = true;
    }

    const maxWidth = getContainerMaxWidth(splitter);
    const nextWidth = clamp(startWidth + delta, MIN_PANEL, maxWidth);
    setWidth(nextWidth);
  }

  splitter.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || activePointerId != null || isPanelCollapsed(kind)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    activePointerId = event.pointerId;
    startPos = event.clientX;
    startWidth = getWidth();
    moved = false;

    splitter.setPointerCapture(activePointerId);
    splitter.classList.add('is-dragging');
    document.body.classList.add('is-resizing');

    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', endDrag, true);
    window.addEventListener('pointercancel', endDrag, true);
    window.addEventListener('blur', endDrag);
    document.addEventListener('visibilitychange', onVisibilityChange);
  });

  splitter.addEventListener('lostpointercapture', endDrag);
  splitter.addEventListener('dragstart', (event) => event.preventDefault());

  splitter.addEventListener('click', (event) => {
    if (moved) {
      event.preventDefault();
      event.stopPropagation();
      moved = false;
    }
  });
}

export function initSplitters() {
  const root = document.documentElement;
  if (!root.style.getPropertyValue('--workspace-panel-width')) {
    root.style.setProperty('--workspace-panel-width', '232px');
  }
  if (!root.style.getPropertyValue('--outline-panel-width')) {
    root.style.setProperty('--outline-panel-width', '220px');
  }
  if (!root.style.getPropertyValue('--comments-panel-width')) {
    root.style.setProperty('--comments-panel-width', '300px');
  }

  const workspaceSplitter = document.querySelector('.splitter[data-split="workspace"]');
  if (workspaceSplitter) {
    initSplitter(workspaceSplitter, {
      kind: 'workspace',
      getWidth: () => parseInt(getComputedStyle(root).getPropertyValue('--workspace-panel-width'), 10) || 232,
      setWidth: (width) => root.style.setProperty('--workspace-panel-width', `${width}px`)
    });
  }

  const outlineSplitter = document.querySelector('.splitter[data-split="outline"]');
  if (outlineSplitter) {
    initSplitter(outlineSplitter, {
      kind: 'outline',
      getWidth: () => parseInt(getComputedStyle(root).getPropertyValue('--outline-panel-width'), 10) || 220,
      setWidth: (width) => root.style.setProperty('--outline-panel-width', `${width}px`)
    });
  }

  const commentsSplitter = document.querySelector('.splitter[data-split="comments"]');
  if (commentsSplitter) {
    initSplitter(commentsSplitter, {
      kind: 'comments',
      invertDelta: true,
      getWidth: () => parseInt(getComputedStyle(root).getPropertyValue('--comments-panel-width'), 10) || 300,
      setWidth: (width) => root.style.setProperty('--comments-panel-width', `${width}px`)
    });
  }
}
