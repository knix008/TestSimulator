import { createTreePanel } from './ui/treeView.js';
import { showPopupMenu } from './ui/popupMenu.js';
import { t } from './i18n/index.js';

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
    }
  };
}

export { showPopupMenu };
