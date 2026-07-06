import { createIconElement } from './icons.js';

export function buildHeadingTree(headings) {
  const roots = [];
  const stack = [];

  for (const heading of headings) {
    const node = {
      key: heading.id,
      label: heading.text?.trim() || '',
      icon: `h${heading.level}`,
      children: [],
      payload: heading
    };

    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].node.children.push(node);
    }

    stack.push({ level: heading.level, node });
  }

  return roots;
}

export function createTreePanel(container, { storageKey = 'tree' } = {}) {
  const collapsedKeys = new Set();
  let lastRoots = [];
  let lastOptions = {};
  let selectedKey = null;

  function toggleKey(key) {
    if (collapsedKeys.has(key)) {
      collapsedKeys.delete(key);
    } else {
      collapsedKeys.add(key);
    }
    refresh();
  }

  function renderNode(node, depth, options, ancestorContinues = [], isLastSibling = true) {
    const li = document.createElement('li');
    li.className = 'tree-item';
    li.setAttribute('role', 'treeitem');
    li.setAttribute('aria-level', String(depth + 1));

    const hasChildren = node.children?.length > 0;
    const key = options.getNodeKey(node);
    const collapsed = hasChildren && collapsedKeys.has(key);
    const showRootLines = options.showRootLines !== false;

    if (hasChildren) {
      li.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }

    const row = document.createElement('div');
    row.className = 'tree-row';
    if (node.payload?.kind) {
      row.dataset.kind = node.payload.kind;
      row.dataset.id = String(node.payload.id);
      if (node.payload.workspaceId) {
        row.dataset.workspaceId = String(node.payload.workspaceId);
      }
    }
    row.dataset.key = key;
    if (selectedKey === key) {
      row.classList.add('is-active');
    }

    const guides = document.createElement('span');
    guides.className = 'tree-guides';
    guides.setAttribute('aria-hidden', 'true');

    for (let level = 0; level < depth; level += 1) {
      const guide = document.createElement('span');
      guide.className = 'tree-guide';
      if (ancestorContinues[level]) {
        guide.classList.add('tree-guide-continue');
      }
      if (level === depth - 1) {
        guide.classList.add('tree-guide-junction');
        if (isLastSibling) {
          guide.classList.add('tree-guide-junction-last');
        }
      }
      guides.appendChild(guide);
    }

    const anchor = document.createElement('span');
    anchor.className = 'tree-guide tree-guide-anchor';
    if (depth === 0 && showRootLines && !isLastSibling) {
      anchor.classList.add('tree-guide-root-continue');
    }

    if (hasChildren) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'tree-toggle';
      toggle.setAttribute('aria-label', collapsed ? options.expandLabel || 'Expand' : options.collapseLabel || 'Collapse');
      toggle.textContent = collapsed ? '▶' : '▼';
      toggle.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleKey(key);
      });
      anchor.appendChild(toggle);
    } else {
      anchor.classList.add('tree-guide-leaf');
      const spacer = document.createElement('span');
      spacer.className = 'tree-toggle-spacer';
      anchor.appendChild(spacer);
    }

    guides.appendChild(anchor);
    row.appendChild(guides);

    if (node.icon) {
      const iconWrap = document.createElement('span');
      iconWrap.className = 'tree-icon';
      iconWrap.appendChild(createIconElement(node.icon, 16));
      row.appendChild(iconWrap);
    }

    const label = document.createElement('span');
    label.className = 'tree-label';
    label.textContent = node.label;
    row.appendChild(label);

    const badgeText = options.renderBadge?.(node);
    if (badgeText) {
      const badge = document.createElement('span');
      badge.className = 'tree-badge';
      badge.textContent = badgeText;
      row.appendChild(badge);
    }

    row.addEventListener('click', () => {
      selectedKey = key;
      options.onSelect?.(node, row);
      refreshSelection();
    });

    row.addEventListener('dblclick', (event) => {
      if (hasChildren && options.toggleOnDoubleClick) {
        event.preventDefault();
        event.stopPropagation();
        toggleKey(key);
        return;
      }
      options.onDoubleClick?.(node, event);
    });

    row.addEventListener('contextmenu', (event) => {
      selectedKey = key;
      options.onContextMenu?.(node, event, row);
      refreshSelection();
    });

    li.appendChild(row);

    if (hasChildren && !collapsed) {
      const childList = document.createElement('ul');
      childList.className = 'tree-children';
      childList.setAttribute('role', 'group');
      for (let index = 0; index < node.children.length; index += 1) {
        const child = node.children[index];
        const childIsLast = index === node.children.length - 1;
        const childContinues = [...ancestorContinues, !isLastSibling];
        childList.appendChild(renderNode(child, depth + 1, options, childContinues, childIsLast));
      }
      li.appendChild(childList);
    }

    return li;
  }

  function refreshSelection() {
    container.querySelectorAll('.tree-row').forEach((row) => {
      row.classList.toggle('is-active', row.dataset.key === selectedKey);
    });
  }

  function refresh() {
    render(lastRoots, lastOptions);
  }

  function render(roots, options = {}) {
    lastRoots = roots || [];
    lastOptions = options;
    container.replaceChildren();
    container.classList.add('tree-panel');
    container.setAttribute('role', 'tree');

    if (!lastRoots.length) {
      container.removeAttribute('role');
      if (options.emptyMessage) {
        const empty = document.createElement('p');
        empty.className = 'tree-empty';
        empty.textContent = options.emptyMessage;
        container.appendChild(empty);
      }
      return;
    }

    const rootList = document.createElement('ul');
    rootList.className = 'tree-root';
    rootList.setAttribute('role', 'group');
    for (let index = 0; index < lastRoots.length; index += 1) {
      const node = lastRoots[index];
      const isLastRoot = index === lastRoots.length - 1;
      rootList.appendChild(renderNode(node, 0, options, [], isLastRoot));
    }
    container.appendChild(rootList);
  }

  return {
    render,
    refresh,
    clearSelection() {
      selectedKey = null;
      refreshSelection();
    },
    setSelectedKey(key) {
      selectedKey = key;
      refreshSelection();
    },
    getSelectedKey() {
      return selectedKey;
    },
    expandAll() {
      collapsedKeys.clear();
      refresh();
    },
    collapseAll() {
      const collect = (nodes) => {
        for (const node of nodes) {
          if (node.children?.length) {
            collapsedKeys.add(lastOptions.getNodeKey?.(node) ?? node.key);
            collect(node.children);
          }
        }
      };
      collect(lastRoots);
      refresh();
    },
    toggleKey,
    isCollapsed(key) {
      return collapsedKeys.has(key);
    }
  };
}
