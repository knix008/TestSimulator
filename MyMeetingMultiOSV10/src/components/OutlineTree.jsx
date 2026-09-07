import React from 'react';
import { useTranslation } from 'react-i18next';

// Build a nested tree from the flat node list. Each node nests under the
// nearest preceding node of a shallower level (skipped levels are tolerated).
function buildTree(items) {
  const root = { level: 0, children: [] };
  const stack = [root];
  for (const it of items) {
    const node = { ...it, children: [] };
    while (stack.length > 1 && stack[stack.length - 1].level >= it.level) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return root.children;
}

function TreeNodes({ nodes, onSelect, onItemContextMenu }) {
  return (
    <ul className="tree-list">
      {nodes.map((n) => (
        <li key={n.key ?? n.index} className="tree-node">
          <div
            className={`tree-row lvl-${n.level} kind-${n.kind || 'heading'}`}
            onClick={() => onSelect?.(n)}
            onContextMenu={(e) => onItemContextMenu?.(e, n)}
            title={n.text}
          >
            <span className="tree-marker" aria-hidden="true" />
            <span className="tree-text">{n.text || ' '}</span>
          </div>
          {n.children.length > 0 && (
            <TreeNodes nodes={n.children} onSelect={onSelect} onItemContextMenu={onItemContextMenu} />
          )}
        </li>
      ))}
    </ul>
  );
}

// Renders the whole document as a TreeView with connector lines between parents
// and children: the notes headings (H1–H6) plus the detail-panel fields and list
// entries that the exported document is built from.
export default function OutlineTree({ outline, onSelect, onItemContextMenu }) {
  const { t } = useTranslation();

  if (!outline.length) {
    return <div className="empty"><p className="muted">{t('structure.none')}</p></div>;
  }

  const headings = outline.filter((n) => !n.kind || n.kind === 'heading').length;
  const tree = buildTree(outline);
  return (
    <div className="outline tree">
      <div className="outline-head">
        {t('structure.headings', { count: headings })}
        {outline.length > headings && ` · ${t('structure.entries', { count: outline.length - headings })}`}
      </div>
      <TreeNodes nodes={tree} onSelect={onSelect} onItemContextMenu={onItemContextMenu} />
    </div>
  );
}
