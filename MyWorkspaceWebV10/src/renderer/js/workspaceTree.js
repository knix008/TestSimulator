import { createTreePanel } from './ui/treeView.js';
import { showPopupMenu } from './ui/popupMenu.js';
import { t } from './i18n/index.js';
import {
  collectMarkdownPathsFromDataTransfer,
  isMarkdownFileDrag
} from './droppedFiles.js';

function resolveTreeIcon(node) {
  if (node.kind === 'FavoritesRoot') {
    return 'favorite';
  }
  if (node.kind === 'Page') {
    return node.isLocked ? 'page_locked' : 'page';
  }
  if (node.kind === 'Workspace') {
    if (node.isLocked) {
      return 'workspace_locked';
    }
    if (node.isFavorite) {
      return 'favorite';
    }
    return 'workspace';
  }
  return 'workspace';
}

function mapWorkspaceNode(node) {
  return {
    key: `${node.kind}:${node.id}`,
    label: node.name,
    icon: resolveTreeIcon(node),
    children: (node.children || []).map(mapWorkspaceNode),
    payload: node
  };
}

function resolveWorkspaceIdFromRow(row) {
  if (!row) {
    return null;
  }

  const kind = row.dataset.kind;
  if (kind === 'Workspace') {
    return Number(row.dataset.id);
  }
  if (kind === 'Page') {
    return Number(row.dataset.workspaceId);
  }
  return null;
}

function findTreeRowFromPoint(clientX, clientY) {
  const element = document.elementFromPoint(clientX, clientY);
  return element?.closest?.('.tree-row') || null;
}

export function attachWorkspaceMarkdownDrop(container, treePanel, { getFallbackWorkspaceId, isEnabled, onImport, onDropRejected }) {
  let highlightedRow = null;

  function clearHighlight() {
    if (highlightedRow) {
      highlightedRow.classList.remove('is-drop-target');
      highlightedRow = null;
    }
  }

  function setHighlight(row) {
    if (highlightedRow === row) {
      return;
    }
    clearHighlight();
    if (row) {
      highlightedRow = row;
      highlightedRow.classList.add('is-drop-target');
      const key = row.dataset.key;
      if (key) {
        treePanel.setSelectedKey(key);
      }
    }
  }

  function resolveWorkspaceId(event) {
    const row = findTreeRowFromPoint(event.clientX, event.clientY);
    const workspaceId = resolveWorkspaceIdFromRow(row) ?? getFallbackWorkspaceId?.();
    return { row, workspaceId };
  }

  function rejectDrop(reason) {
    onDropRejected?.(reason);
  }

  function handleDragEnter(event) {
    if (!isEnabled?.() || !isMarkdownFileDrag(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function handleDragOver(event) {
    if (!isEnabled?.() || !isMarkdownFileDrag(event)) {
      clearHighlight();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';

    const { row, workspaceId } = resolveWorkspaceId(event);
    if (!workspaceId) {
      clearHighlight();
      return;
    }

    setHighlight(row);
  }

  function handleDragLeave(event) {
    if (!container.contains(event.relatedTarget)) {
      clearHighlight();
    }
  }

  async function handleDrop(event) {
    clearHighlight();

    if (!isEnabled?.() || !isMarkdownFileDrag(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const paths = collectMarkdownPathsFromDataTransfer(event.dataTransfer);
    if (!paths.length) {
      rejectDrop('paths');
      return;
    }

    const { workspaceId } = resolveWorkspaceId(event);
    if (!workspaceId) {
      rejectDrop('workspace');
      return;
    }

    await onImport?.(workspaceId, paths);
  }

  container.addEventListener('dragenter', handleDragEnter, true);
  container.addEventListener('dragover', handleDragOver, true);
  container.addEventListener('dragleave', handleDragLeave, true);
  container.addEventListener('drop', handleDrop, true);
}

export function createWorkspaceTree(container, { onSelectPage, onCreatePage, onContextMenu, onEmptyContextMenu }) {
  const tree = createTreePanel(container, { storageKey: 'workspace' });
  let selectedNode = null;

  function render(treeData) {
    const roots = (treeData || []).map(mapWorkspaceNode);
    tree.render(roots, {
      emptyMessage: 'Workspace가 없습니다. Workspace 메뉴에서 추가하세요.',
      getNodeKey: (node) => node.key,
      expandLabel: t.treeExpand,
      collapseLabel: t.treeCollapse,
      toggleOnDoubleClick: false,
      renderBadge: (node) => (node.payload?.isLocked ? '잠김' : null),
      onSelect: (node) => {
        selectedNode = node.payload;
        if (node.payload?.kind === 'Page') {
          onSelectPage(node.payload);
        } else if (node.payload?.kind === 'Workspace') {
          selectedNode = node.payload;
        }
      },
      onDoubleClick: async (node, event) => {
        if (node.payload?.kind === 'Workspace') {
          event.preventDefault();
          await onCreatePage(node.payload.id);
        }
      },
      onContextMenu: (node, event, row) => {
        if (node.payload?.kind === 'FavoritesRoot') {
          onEmptyContextMenu?.(event, row);
          return;
        }
        selectedNode = node.payload;
        onContextMenu?.(event, node.payload, row);
      }
    });
  }

  container.addEventListener('contextmenu', (event) => {
    if (event.target.closest('.tree-row')) {
      return;
    }
    event.preventDefault();
    onEmptyContextMenu?.(event, container);
  });

  return {
    render,
    getSelection() {
      return selectedNode;
    },
    clearSelection() {
      selectedNode = null;
      tree.clearSelection();
    },
    getTreePanel() {
      return tree;
    }
  };
}

export { showPopupMenu };
