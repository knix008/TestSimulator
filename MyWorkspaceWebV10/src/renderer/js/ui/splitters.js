const MIN_PANEL = 160;
const MAX_PANEL = 520;

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

function initSplitter(splitter, { kind, getWidth, setWidth }) {
  splitter.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || isPanelCollapsed(kind)) {
      return;
    }
    event.preventDefault();

    const startPos = event.clientX;
    const startWidth = getWidth();
    splitter.classList.add('is-dragging');
    document.body.classList.add('is-resizing');

    function onMove(moveEvent) {
      const delta = moveEvent.clientX - startPos;
      const nextWidth = clamp(startWidth + delta, MIN_PANEL, MAX_PANEL);
      setWidth(nextWidth);
    }

    function onUp() {
      splitter.classList.remove('is-dragging');
      document.body.classList.remove('is-resizing');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
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
      getWidth: () => parseInt(getComputedStyle(root).getPropertyValue('--comments-panel-width'), 10) || 300,
      setWidth: (width) => root.style.setProperty('--comments-panel-width', `${width}px`)
    });
  }
}
