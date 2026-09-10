// Call graph: an expandable tree on the left, the same tree drawn as a diagram
// on the right. Both are driven by one expansion state, so what you fold away
// in the tree disappears from the picture too.

import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DiagramCanvas, ellipsize } from '../components/common.jsx';
import { layoutTree, curvePath } from '../components/layout.js';
import { baseName } from '../core/languages.js';
import { IconExpandAll, IconCollapseAll } from '../components/icons.jsx';

const NODE_WIDTH = 190;
const NODE_HEIGHT = 40;
const MAX_DRAWN_NODES = 1200;

/**
 * Selection highlighting. The dim is what does the work: a brighter line among
 * equally bright lines is hard to find, a bright line among faded ones is not.
 */
const EDGE_WIDTH = 1.2;
const EDGE_WIDTH_HOT = 2.8;
const EDGE_DIM_OPACITY = 0.15;

/** Caps on "expand all": deep enough to be useful, bounded enough to draw. */
const MAX_EXPAND_DEPTH = 8;
const MAX_EXPAND_KEYS = 3000;

export default function CallGraphView({ result, diagramRef, onOpenSource, search }) {
  const { t } = useTranslation();
  const graph = result.graph;

  const roots = useMemo(() => {
    const ids = graph.entryPointIds.length > 0 ? graph.entryPointIds : graph.nodes.slice(0, 200).map((n) => n.id);
    return ids.map((id) => graph.nodeMap.get(id)).filter(Boolean);
  }, [graph]);

  const [rootId, setRootId] = useState(() => (roots[0] ? roots[0].id : null));
  const [direction, setDirection] = useState('lr');
  const [expanded, setExpanded] = useState(() => new Set());
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (roots.length === 0) {
      setRootId(null);
      return;
    }
    if (!rootId || !graph.nodeMap.has(rootId)) setRootId(roots[0].id);
  }, [roots, rootId, graph]);

  /** Every reachable path from `id`, as expansion keys. */
  const allKeysFrom = useCallback(
    (id) => {
      const keys = new Set();
      const walk = (nodeId, path, ancestors, depth) => {
        const key = path ? path + '>' + nodeId : nodeId;
        if (depth > MAX_EXPAND_DEPTH || keys.size > MAX_EXPAND_KEYS || ancestors.has(nodeId)) return;
        keys.add(key);
        for (const child of graph.outgoing.get(nodeId) || []) {
          walk(child, key, new Set([...ancestors, nodeId]), depth + 1);
        }
      };
      walk(id, '', new Set(), 0);
      return keys;
    },
    [graph],
  );

  // A new entry point opens fully expanded: the point of the view is the shape
  // of the whole call tree, and the depth and node caps keep it drawable.
  useEffect(() => {
    if (!rootId) return;
    setExpanded(allKeysFrom(rootId));
  }, [rootId, allKeysFrom]);

  const tree = useMemo(() => {
    if (!rootId) return null;
    let produced = 0;

    const build = (id, path, ancestors) => {
      const node = graph.nodeMap.get(id);
      if (!node || produced >= MAX_DRAWN_NODES) return null;
      produced++;

      const key = path ? path + '>' + id : id;
      const recursive = ancestors.has(id);
      const childIds = recursive ? [] : graph.outgoing.get(id) || [];
      const isOpen = expanded.has(key);

      return {
        id,
        key,
        displayName: node.displayName,
        fullName: node.fullName,
        filePath: node.filePath,
        lineNumber: node.lineNumber,
        languageId: node.languageId,
        recursive,
        childCount: childIds.length,
        expanded: isOpen,
        children: isOpen
          ? childIds.map((child) => build(child, key, new Set([...ancestors, id]))).filter(Boolean)
          : [],
      };
    };

    return build(rootId, '', new Set());
  }, [rootId, expanded, graph]);

  const layout = useMemo(() => {
    if (!tree) return null;
    return layoutTree(tree, {
      nodeWidth: NODE_WIDTH,
      nodeHeight: NODE_HEIGHT,
      gapX: direction === 'lr' ? 66 : 30,
      gapY: direction === 'lr' ? 14 : 60,
      direction,
    });
  }, [tree, direction]);

  const toggle = (key) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const expandAll = () => {
    if (rootId) setExpanded(allKeysFrom(rootId));
  };

  const collapseAll = () => setExpanded(new Set(rootId ? [rootId] : []));

  if (roots.length === 0) {
    return <div className="empty-state">{t('common.noData')}</div>;
  }

  const highlight = (text) => (search && text.toLowerCase().includes(search.toLowerCase()) ? 'var(--accent)' : null);

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      <div style={{ width: 330, flex: '0 0 330px', borderRight: '1px solid var(--border)', overflow: 'auto' }}>
        <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
          <div className="field-label" style={{ marginBottom: 4 }}>
            {t('common.entryPoint')} ({roots.length})
          </div>
          <select className="input" style={{ width: '100%' }} value={rootId || ''} onChange={(e) => setRootId(e.target.value)}>
            {roots.map((node) => (
              <option key={node.id} value={node.id}>
                {node.displayName} — {baseName(node.filePath)}:{node.lineNumber}
              </option>
            ))}
          </select>
        </div>
        <div className="calltree">{tree ? <TreeRows node={tree} depth={0} onToggle={toggle} selected={selected} onSelect={setSelected} onOpenSource={onOpenSource} highlight={highlight} /> : null}</div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <DiagramCanvas
          ref={diagramRef}
          storageKey="callGraph"
          fitKey={'callGraph:' + (rootId || '') + ':' + direction}
          width={layout ? layout.width : 0}
          height={layout ? layout.height : 0}
          onBackgroundClick={() => setSelected(null)}
          toolbar={
            <>
              <span className="field-label">{t('views.callGraph')}</span>
              <select className="input" value={direction} onChange={(e) => setDirection(e.target.value)}>
                <option value="lr">→ 좌→우</option>
                <option value="tb">↓ 위→아래</option>
              </select>
              <button type="button" className="btn small" title={t('common.expandAll')} onClick={expandAll}>
                <IconExpandAll size={14} />
                <span>{t('common.expandAll')}</span>
              </button>
              <button type="button" className="btn small" title={t('common.collapseAll')} onClick={collapseAll}>
                <IconCollapseAll size={14} />
                <span>{t('common.collapseAll')}</span>
              </button>
              <span className="field-label">{layout ? layout.nodes.length : 0} nodes</span>
            </>
          }
        >
          {layout ? (
            <>
              <defs>
                <marker id="cg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--edge)" />
                </marker>
                <marker id="cg-arrow-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--edge-highlight)" />
                </marker>
              </defs>
              {/* Connected edges are drawn last so no other line covers them. */}
              {[...layout.edges]
                .map((edge, index) => ({
                  edge,
                  index,
                  hot: !!selected && (selected === edge.fromNode.key || selected === edge.toNode.key),
                }))
                .sort((a, b) => Number(a.hot) - Number(b.hot))
                .map(({ edge, index, hot }) => (
                  <path
                    key={index}
                    d={curvePath(edge.from, edge.to, direction)}
                    fill="none"
                    stroke={hot ? 'var(--edge-highlight)' : 'var(--edge)'}
                    strokeWidth={hot ? EDGE_WIDTH_HOT : EDGE_WIDTH}
                    strokeOpacity={selected && !hot ? EDGE_DIM_OPACITY : 1}
                    markerEnd={hot ? 'url(#cg-arrow-hot)' : 'url(#cg-arrow)'}
                  />
                ))}
              {layout.nodes.map((entry) => (
                <CallNode
                  key={entry.node.key}
                  entry={entry}
                  dimmed={
                    !!selected &&
                    selected !== entry.node.key &&
                    !layout.edges.some(
                      (edge) =>
                        (edge.fromNode.key === selected && edge.toNode.key === entry.node.key) ||
                        (edge.toNode.key === selected && edge.fromNode.key === entry.node.key),
                    )
                  }
                  selected={selected === entry.node.key}
                  onSelect={() => setSelected(entry.node.key)}
                  onToggle={() => toggle(entry.node.key)}
                  onOpenSource={onOpenSource}
                  search={search}
                />
              ))}
            </>
          ) : null}
        </DiagramCanvas>
      </div>
    </div>
  );
}

function TreeRows({ node, depth, onToggle, selected, onSelect, onOpenSource, highlight }) {
  // Children live inside a nested container rather than being indented by
  // padding: that is what lets CSS draw the vertical guide per level and the
  // elbow into each row, so the parent/child relation is visible, not implied.
  return (
    <div className="calltree-node">
      <div
        className={'calltree-row' + (selected === node.key ? ' selected' : '')}
        onClick={() => onSelect(node.key)}
        onDoubleClick={() => onOpenSource(node)}
      >
        {node.childCount > 0 ? (
          <button type="button" className="twisty" onClick={(e) => { e.stopPropagation(); onToggle(node.key); }}>
            {node.expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="twisty" />
        )}
        <span className="fn" style={{ color: highlight(node.displayName) || undefined }}>
          {node.displayName}
        </span>
        <span className="loc">
          {baseName(node.filePath)}:{node.lineNumber}
        </span>
        {node.recursive ? <span className="recursive">↻</span> : null}
        {node.childCount > 0 && !node.expanded ? <span className="loc">({node.childCount})</span> : null}
      </div>
      {node.expanded && node.children.length > 0 ? (
        <div className="calltree-children">
          {node.children.map((child) => (
            <TreeRows
              key={child.key}
              node={child}
              depth={depth + 1}
              onToggle={onToggle}
              selected={selected}
              onSelect={onSelect}
              onOpenSource={onOpenSource}
              highlight={highlight}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CallNode({ entry, selected, dimmed, onSelect, onToggle, onOpenSource, search }) {
  const node = entry.node;
  const matched = search && node.displayName.toLowerCase().includes(search.toLowerCase());
  const stroke = selected ? 'var(--accent)' : matched ? 'var(--warning)' : 'var(--node-stroke)';

  return (
    <g
      data-node={node.key}
      transform={`translate(${entry.x}, ${entry.y})`}
      onClick={onSelect}
      onDoubleClick={() => onOpenSource(node)}
      style={{ cursor: 'pointer' }}
      opacity={dimmed ? 0.35 : 1}
    >
      <rect
        width={entry.width}
        height={entry.height}
        rx="7"
        fill={selected ? 'var(--bg-active)' : 'var(--node-fill)'}
        stroke={stroke}
        strokeWidth={selected || matched ? 2 : 1}
      />
      <text x="10" y="17" fill="var(--node-text)" fontSize="12.5" fontWeight="600">
        {ellipsize(node.displayName, 24)}
      </text>
      <text x="10" y="31" fill="var(--text-faint)" fontSize="10.5">
        {ellipsize(baseName(node.filePath), 20)}:{node.lineNumber}
      </text>
      {node.recursive ? (
        <text x={entry.width - 14} y="18" fill="var(--warning)" fontSize="13">
          ↻
        </text>
      ) : null}
      {node.childCount > 0 ? (
        <g onClick={(e) => { e.stopPropagation(); onToggle(); }}>
          <circle cx={entry.width - 12} cy={entry.height - 12} r="8" fill="var(--bg-panel)" stroke="var(--border-strong)" />
          <text x={entry.width - 12} y={entry.height - 8} fill="var(--text-dim)" fontSize="10" textAnchor="middle">
            {node.expanded ? '−' : node.childCount > 9 ? '+' : node.childCount}
          </text>
        </g>
      ) : null}
    </g>
  );
}
