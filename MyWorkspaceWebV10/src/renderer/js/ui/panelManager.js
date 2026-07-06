import { t } from '../i18n/index.js';
import { buildHeadingTree, createTreePanel } from './treeView.js';

const EXPAND_CLICK_THRESHOLD = 4;

let outlineTree = null;
let outlinePageKey = null;

function getOutlineTree() {
  if (!outlineTree) {
    outlineTree = createTreePanel(document.getElementById('outline-tree'), { storageKey: 'outline' });
  }
  return outlineTree;
}

export function createPanelManager({ onChange } = {}) {
  const state = {
    workspacePanelVisible: true,
    outlinePanelVisible: false,
    commentsPanelVisible: false,
    pageSearchVisible: true
  };

  const outerSplit = document.getElementById('outer-split');
  const editorAreaSplit = document.getElementById('editor-area-split');
  const commentsEditorSplit = document.getElementById('comments-editor-split');
  const workspacePanel = document.getElementById('workspace-panel');
  const outlinePanel = document.getElementById('outline-panel');
  const commentsPanel = document.getElementById('comments-panel');
  const searchWrap = document.getElementById('title-bar-search-wrap');
  const workspaceSplitter = document.querySelector('.splitter[data-split="workspace"]');
  const outlineSplitter = document.querySelector('.splitter[data-split="outline"]');
  const commentsSplitter = document.querySelector('.splitter[data-split="comments"]');

  function getState() {
    return { ...state };
  }

  function syncDom() {
    outerSplit.classList.toggle('workspace-collapsed', !state.workspacePanelVisible);
    workspacePanel.classList.toggle('collapsed', !state.workspacePanelVisible);

    editorAreaSplit.classList.toggle('outline-visible', state.outlinePanelVisible);
    outlinePanel.classList.toggle('collapsed', !state.outlinePanelVisible);

    commentsEditorSplit.classList.toggle('comments-visible', state.commentsPanelVisible);
    commentsPanel.classList.toggle('collapsed', !state.commentsPanelVisible);

    searchWrap.classList.toggle('hidden', !state.pageSearchVisible || document.getElementById('app-shell')?.classList.contains('hidden'));

    const commentsToggle = document.getElementById('btn-collapse-comments');
    commentsToggle.textContent = state.commentsPanelVisible ? t.commentsCollapse : t.commentsExpand;
    commentsToggle.title = state.commentsPanelVisible ? t.commentsCollapse : t.commentsExpand;

    workspaceSplitter?.setAttribute('aria-label', state.workspacePanelVisible ? t.splitterWorkspace : t.workspacePanelExpand);
    outlineSplitter?.setAttribute('aria-label', state.outlinePanelVisible ? t.splitterOutline : t.outlineExpand);
    commentsSplitter?.setAttribute('aria-label', state.commentsPanelVisible ? t.splitterComments : t.commentsExpand);

    onChange?.(getState());
  }

  function wirePanelToggle(buttonId, toggleFn) {
    const button = document.getElementById(buttonId);
    if (!button) {
      return;
    }
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleFn();
    });
  }

  function wireExpandStrip(splitter, isCollapsed, expandFn) {
    if (!splitter) {
      return;
    }

    let pointerDown = false;
    let startX = 0;
    let startY = 0;

    splitter.addEventListener('pointerdown', (event) => {
      if (!isCollapsed() || event.button !== 0) {
        pointerDown = false;
        return;
      }
      pointerDown = true;
      startX = event.clientX;
      startY = event.clientY;
    });

    splitter.addEventListener('pointerup', (event) => {
      if (!pointerDown || !isCollapsed() || event.button !== 0) {
        pointerDown = false;
        return;
      }
      pointerDown = false;
      const dx = Math.abs(event.clientX - startX);
      const dy = Math.abs(event.clientY - startY);
      if (dx < EXPAND_CLICK_THRESHOLD && dy < EXPAND_CLICK_THRESHOLD) {
        expandFn();
      }
    });

    splitter.addEventListener('pointercancel', () => {
      pointerDown = false;
    });
  }

  wirePanelToggle('btn-collapse-comments', () => {
    state.commentsPanelVisible = !state.commentsPanelVisible;
    syncDom();
  });

  wireExpandStrip(
    workspaceSplitter,
    () => !state.workspacePanelVisible,
    () => {
      state.workspacePanelVisible = true;
      syncDom();
    }
  );

  wireExpandStrip(
    outlineSplitter,
    () => !state.outlinePanelVisible,
    () => {
      state.outlinePanelVisible = true;
      syncDom();
    }
  );

  wireExpandStrip(
    commentsSplitter,
    () => !state.commentsPanelVisible,
    () => {
      state.commentsPanelVisible = true;
      syncDom();
    }
  );

  syncDom();

  return {
    getState,
    toggleWorkspacePanel() {
      state.workspacePanelVisible = !state.workspacePanelVisible;
      syncDom();
    },
    toggleOutlinePanel() {
      state.outlinePanelVisible = !state.outlinePanelVisible;
      syncDom();
    },
    toggleCommentsPanel() {
      state.commentsPanelVisible = !state.commentsPanelVisible;
      syncDom();
    },
    togglePageSearch() {
      state.pageSearchVisible = !state.pageSearchVisible;
      syncDom();
    },
    setPageSearchVisible(visible) {
      state.pageSearchVisible = visible;
      syncDom();
    },
    setWorkspacePanelVisible(visible) {
      state.workspacePanelVisible = visible;
      syncDom();
    },
    refresh() {
      syncDom();
    }
  };
}

export function renderOutline(headings, { pageKey = null, resetExpansion = false } = {}) {
  const tree = getOutlineTree();
  if (resetExpansion) {
    outlinePageKey = pageKey;
    tree.expandAll();
  } else if (pageKey != null && pageKey !== outlinePageKey) {
    outlinePageKey = pageKey;
    tree.expandAll();
  }
  const roots = buildHeadingTree(
    headings.map((heading) => ({
      ...heading,
      text: heading.text?.trim() || t.labelOutline
    }))
  );
  tree.render(roots, {
    emptyMessage: t.outlineEmpty,
    getNodeKey: (node) => node.key,
    expandLabel: t.treeExpand,
    collapseLabel: t.treeCollapse,
    toggleOnDoubleClick: true,
    onSelect: (node) => {
      node.payload?.onClick?.();
    }
  });
}
