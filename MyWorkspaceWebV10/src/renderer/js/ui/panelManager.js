import { t } from '../i18n/ko.js';

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

    searchWrap.classList.toggle('hidden', !state.pageSearchVisible);

    const workspaceToggle = document.getElementById('btn-collapse-workspace');
    workspaceToggle.textContent = state.workspacePanelVisible
      ? t.workspacePanelCollapse
      : t.workspacePanelExpand;
    workspaceToggle.title = state.workspacePanelVisible ? t.workspacePanelCollapse : t.workspacePanelExpand;

    const outlineToggle = document.getElementById('btn-collapse-outline');
    outlineToggle.textContent = state.outlinePanelVisible ? t.outlineCollapse : t.outlineExpand;
    outlineToggle.title = state.outlinePanelVisible ? t.outlineCollapse : t.outlineExpand;

    const commentsToggle = document.getElementById('btn-collapse-comments');
    commentsToggle.textContent = state.commentsPanelVisible ? t.commentsCollapse : t.commentsExpand;
    commentsToggle.title = state.commentsPanelVisible ? t.commentsCollapse : t.commentsExpand;

    workspaceSplitter?.setAttribute('aria-label', state.workspacePanelVisible ? 'Workspace 크기 조절' : t.workspacePanelExpand);
    outlineSplitter?.setAttribute('aria-label', state.outlinePanelVisible ? '문서 구조 크기 조절' : t.outlineExpand);
    commentsSplitter?.setAttribute('aria-label', state.commentsPanelVisible ? '댓글 크기 조절' : t.commentsExpand);

    onChange?.(getState());
  }

  function wirePanelToggle(buttonId, toggleFn) {
    document.getElementById(buttonId).addEventListener('click', (event) => {
      event.stopPropagation();
      toggleFn();
    });
  }

  function wireExpandStrip(splitter, isCollapsed, expandFn) {
    if (!splitter) {
      return;
    }
    splitter.addEventListener('click', () => {
      if (isCollapsed()) {
        expandFn();
      }
    });
  }

  wirePanelToggle('btn-collapse-workspace', () => {
    state.workspacePanelVisible = !state.workspacePanelVisible;
    syncDom();
  });

  wirePanelToggle('btn-collapse-outline', () => {
    state.outlinePanelVisible = !state.outlinePanelVisible;
    syncDom();
  });

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

export function renderOutline(headings) {
  const container = document.getElementById('outline-tree');
  container.replaceChildren();

  if (!headings.length) {
    const empty = document.createElement('p');
    empty.className = 'comments-placeholder';
    empty.textContent = t.outlineEmpty;
    container.appendChild(empty);
    return;
  }

  for (const heading of headings) {
    const link = document.createElement('a');
    link.href = '#';
    link.className = `outline-link level-${heading.level}`;
    link.textContent = heading.text || t.labelOutline;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      heading.onClick?.();
    });
    container.appendChild(link);
  }
}
