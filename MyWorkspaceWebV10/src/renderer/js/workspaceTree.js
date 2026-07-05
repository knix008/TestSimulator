import { createIconElement } from './ui/icons.js';
import { showPopupMenu } from './ui/popupMenu.js';

const collapsedNodes = new Set();

function nodeKey(node) {
  return `${node.kind}:${node.id}`;
}

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

export function createWorkspaceTree(container, { onSelectPage, onCreatePage, onContextMenu, onEmptyContextMenu }) {
  let selectedPageId = null;
  let selectedNode = null;

  function renderNode(node, depth = 0) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tree-node';

    const row = document.createElement('div');
    row.className = 'tree-row';
    row.dataset.kind = node.kind;
    row.dataset.id = String(node.id);
    if (node.workspaceId) {
      row.dataset.workspaceId = String(node.workspaceId);
    }

    const hasChildren = node.children?.length > 0;
    const key = nodeKey(node);
    const collapsed = hasChildren && collapsedNodes.has(key);

    if (hasChildren) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'tree-toggle';
      toggle.textContent = collapsed ? '▶' : '▼';
      toggle.addEventListener('click', (event) => {
        event.stopPropagation();
        if (collapsedNodes.has(key)) {
          collapsedNodes.delete(key);
        } else {
          collapsedNodes.add(key);
        }
        refreshTree();
      });
      row.appendChild(toggle);
    } else {
      const spacer = document.createElement('span');
      spacer.className = 'tree-toggle-spacer';
      row.appendChild(spacer);
    }

    const iconWrap = document.createElement('span');
    iconWrap.className = 'tree-icon';
    iconWrap.appendChild(createIconElement(resolveTreeIcon(node), 16));
    row.appendChild(iconWrap);

    const label = document.createElement('span');
    label.className = 'tree-label';
    label.textContent = node.name;
    row.appendChild(label);

    if (node.isLocked) {
      const badge = document.createElement('span');
      badge.className = 'tree-badge';
      badge.textContent = '잠김';
      row.appendChild(badge);
    }

    row.addEventListener('click', () => {
      selectedNode = node;
      container.querySelectorAll('.tree-row').forEach((item) => item.classList.remove('is-active'));
      row.classList.add('is-active');
      if (node.kind === 'Page') {
        selectedPageId = node.id;
        onSelectPage(node);
      } else if (node.kind === 'Workspace') {
        selectedPageId = null;
      }
    });

    row.addEventListener('dblclick', async (event) => {
      if (node.kind === 'Workspace') {
        event.preventDefault();
        await onCreatePage(node.id);
      }
    });

    row.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      if (node.kind === 'FavoritesRoot') {
        onEmptyContextMenu?.(event, row);
        return;
      }
      selectedNode = node;
      container.querySelectorAll('.tree-row').forEach((item) => item.classList.remove('is-active'));
      row.classList.add('is-active');
      onContextMenu?.(event, node, row);
    });

    wrapper.appendChild(row);

    if (hasChildren && !collapsed) {
      const children = document.createElement('div');
      children.className = 'tree-children';
      for (const child of node.children) {
        children.appendChild(renderNode(child, depth + 1));
      }
      wrapper.appendChild(children);
    }

    return wrapper;
  }

  let lastTree = [];

  function refreshTree() {
    container.replaceChildren();
    if (!lastTree.length) {
      const empty = document.createElement('p');
      empty.className = 'comments-placeholder';
      empty.textContent = 'Workspace가 없습니다. Workspace 메뉴에서 추가하세요.';
      container.appendChild(empty);
      return;
    }

    for (const node of lastTree) {
      container.appendChild(renderNode(node));
    }

    if (selectedNode) {
      const active = container.querySelector(
        `.tree-row[data-kind="${selectedNode.kind}"][data-id="${selectedNode.id}"]`
      );
      active?.classList.add('is-active');
    } else if (selectedPageId != null) {
      const active = container.querySelector(`.tree-row[data-kind="Page"][data-id="${selectedPageId}"]`);
      active?.classList.add('is-active');
    }
  }

  container.addEventListener('contextmenu', (event) => {
    if (event.target.closest('.tree-row')) {
      return;
    }
    event.preventDefault();
    onEmptyContextMenu?.(event, container);
  });

  return {
    render(tree) {
      lastTree = tree || [];
      refreshTree();
    },
    getSelection() {
      return selectedNode;
    },
    clearSelection() {
      selectedNode = null;
      selectedPageId = null;
    }
  };
}

export { showPopupMenu };
