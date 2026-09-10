// Shared UI primitives: modal, sortable data grid, pan/zoom diagram canvas,
// tree, toast. Every view is built out of these, which is what keeps the views
// themselves short enough to read.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/* ------------------------------------------------------------------ Modal */

export function Modal({ title, onClose, children, footer, narrow }) {
  const { t } = useTranslation();

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (narrow ? ' narrow' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="btn ghost" onClick={onClose} aria-label={t('common.close')}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- DataGrid */

/**
 * Sortable, searchable, virtual-window-free grid. Rows are capped (`maxRows`)
 * because a project can produce tens of thousands and the browser would rather
 * we did not hand it all of them at once; the cap is always shown.
 *
 * @param {{columns: Array<{key,label,numeric?,width?,render?,severity?,wide?}>}} props
 */
export function DataGrid({
  columns,
  rows,
  getKey,
  onRowClick,
  onRowDoubleClick,
  selectedKey,
  maxRows = 3000,
  initialSort,
  emptyMessage,
}) {
  const { t } = useTranslation();
  const [sort, setSort] = useState(initialSort || null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column) return rows;
    const direction = sort.direction === 'desc' ? -1 : 1;
    const value = (row) => (column.sortValue ? column.sortValue(row) : row[column.key]);

    return [...rows].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * direction;
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * direction;
    });
  }, [rows, sort, columns]);

  const shown = sorted.slice(0, maxRows);

  const toggleSort = (key) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: 'desc' };
      if (prev.direction === 'desc') return { key, direction: 'asc' };
      return null;
    });
  };

  if (rows.length === 0) {
    return <div className="empty-state">{emptyMessage || t('common.noData')}</div>;
  }

  return (
    <div className="table-wrap">
      <table className="grid">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                style={column.width ? { width: column.width } : undefined}
                onClick={() => toggleSort(column.key)}
                title={column.tip || column.label}
              >
                {column.label}
                {sort && sort.key === column.key ? (
                  <span className="sort">{sort.direction === 'desc' ? '▼' : '▲'}</span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, index) => {
            const key = getKey(row, index);
            return (
              <tr
                key={key}
                className={(selectedKey === key ? 'selected ' : '') + (onRowClick ? 'clickable' : '')}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row) : undefined}
              >
                {columns.map((column) => {
                  const severity = column.severity ? column.severity(row) : 'none';
                  const className =
                    (column.numeric ? 'num ' : '') +
                    (column.wide ? 'wide ' : '') +
                    (severity === 'critical' ? 'cell-critical' : severity === 'warning' ? 'cell-warning' : '');
                  return (
                    <td key={column.key} className={className.trim() || undefined} title={column.cellTitle ? column.cellTitle(row) : undefined}>
                      {column.render ? column.render(row) : formatCell(row[column.key])}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length > shown.length ? (
        <div style={{ padding: '8px 10px', color: 'var(--text-faint)' }}>
          {t('common.showing', { shown: shown.length.toLocaleString(), total: sorted.length.toLocaleString() })}
        </div>
      ) : null}
    </div>
  );
}

function formatCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString('en-US') : value.toFixed(1);
  if (typeof value === 'boolean') return value ? 'O' : '';
  return String(value);
}

/* --------------------------------------------------------- DiagramCanvas */

/**
 * Remembered pan/zoom, one entry per diagram view.
 *
 * Each view mounts its own DiagramCanvas, so leaving a view unmounts it and
 * component state would be gone. Keeping the transform here instead means
 * coming back to a view shows it exactly as it was left — the reader does not
 * have to find their place again after every glance at another view.
 *
 * `fitKey` is stored alongside: it identifies *what is drawn*, so a remembered
 * transform is only restored for the same drawing. Pick a different entry
 * point and the view is fitted afresh, which is what you want for a picture you
 * have not seen before.
 */
const diagramTransforms = new Map();

/** Gap left above a freshly fitted diagram. */
const FIT_TOP_MARGIN = 20;

/** Forgets every remembered transform — call when a new analysis replaces the old. */
export function resetDiagramTransforms() {
  diagramTransforms.clear();
}


/**
 * Pan/zoom host for an SVG diagram. Holds the transform itself (rather than
 * letting each diagram reimplement it) and exposes the DOM node so the export
 * helper can find the live <svg>.
 */
export const DiagramCanvas = React.forwardRef(function DiagramCanvas(
  { width, height, children, toolbar, emptyMessage, onBackgroundClick, fitKey, storageKey },
  ref,
) {
  const { t } = useTranslation();
  const hostRef = useRef(null);
  const memoryKey = storageKey || fitKey || 'default';
  const remembered = diagramTransforms.get(memoryKey);

  const [view, setViewState] = useState(() =>
    remembered ? { x: remembered.x, y: remembered.y, scale: remembered.scale } : { x: 0, y: 0, scale: 1 },
  );
  const drag = useRef(null);
  // Which diagram the current transform belongs to. Expanding a node changes
  // the drawing's size but not its identity, so the zoom must survive it.
  const fittedFor = useRef(remembered && remembered.fitKey === fitKey ? String(fitKey) : null);

  // Every transform change is written straight through to the store, so the
  // value is already there when the view unmounts.
  const setView = setViewState;

  // Remembering the transform is a side effect, so it belongs in an effect, not
  // inside a state updater — React may run an updater more than once, and is
  // free to run it in a later render than the event that queued it.
  useEffect(() => {
    diagramTransforms.set(memoryKey, { ...view, fitKey });
  }, [view, memoryKey, fitKey]);

  useEffect(() => {
    if (ref) {
      if (typeof ref === 'function') ref(hostRef.current);
      else ref.current = hostRef.current;
    }
  });

  const fit = useCallback(() => {
    const host = hostRef.current;
    if (!host || !width || !height) return;
    const rect = host.getBoundingClientRect();
    const scale = Math.min((rect.width - 40) / width, (rect.height - 40) / height, 1.6);
    const safeScale = Number.isFinite(scale) && scale > 0.02 ? scale : 1;
    // Centred horizontally, but pinned to the top: a diagram is read from its
    // roots down, and vertical centring pushes those roots into the middle of
    // the canvas where the eye has to hunt for them.
    setView({
      x: (rect.width - width * safeScale) / 2,
      y: FIT_TOP_MARGIN,
      scale: safeScale,
    });
  }, [width, height]);

  // Fit once per drawing: when the entry point or direction changes (a new
  // `fitKey`), and the first time real dimensions arrive for a drawing we have
  // no remembered transform for.
  //
  // Two things must NOT trigger a refit: expanding or collapsing a node (the
  // drawing resizes but stays the same drawing), and returning to a view that
  // was left zoomed in (the remembered transform is restored above).
  useEffect(() => {
    if (!width || !height) return;
    const key = fitKey === undefined ? 'default' : String(fitKey);
    if (fittedFor.current === key) return;
    fittedFor.current = key;
    fit();
    // `fit` is intentionally not a dependency: it changes with width/height,
    // which is exactly the signal we must not refit on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, width, height]);

  const onWheel = (e) => {
    if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 2) return;
    e.preventDefault();
    const host = hostRef.current;
    const rect = host.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    setView((prev) => {
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const scale = Math.min(6, Math.max(0.05, prev.scale * factor));
      const ratio = scale / prev.scale;
      return { scale, x: px - (px - prev.x) * ratio, y: py - (py - prev.y) * ratio };
    });
  };

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    // Clicks on a node must not start a pan; nodes carry data-node.
    if (e.target.closest && e.target.closest('[data-node]')) return;

    // Suppress the browser's drag-to-select before it starts, and drop any
    // selection already on screen — `user-select: none` stops a new selection
    // inside the canvas, but a drag that began elsewhere can still extend into
    // it, leaving text highlighted behind the diagram.
    e.preventDefault();
    const selection = window.getSelection && window.getSelection();
    if (selection && !selection.isCollapsed) selection.removeAllRanges();

    drag.current = { startX: e.clientX, startY: e.clientY, originX: view.x, originY: view.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    const gesture = drag.current;
    if (!gesture) return;

    const dx = e.clientX - gesture.startX;
    const dy = e.clientY - gesture.startY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) gesture.moved = true;

    // The new position is computed here, from a snapshot. Reading `drag.current`
    // inside the updater would crash the whole renderer: React can run the
    // updater after pointerup has already set the ref back to null.
    const x = gesture.originX + dx;
    const y = gesture.originY + dy;
    setView((prev) => (prev.x === x && prev.y === y ? prev : { ...prev, x, y }));
  };

  const onPointerUp = (e) => {
    const wasDrag = drag.current && drag.current.moved;
    drag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch { /* pointer already released */ }
    if (!wasDrag && onBackgroundClick && !(e.target.closest && e.target.closest('[data-node]'))) onBackgroundClick();
  };

  const zoom = (factor) =>
    setView((prev) => ({ ...prev, scale: Math.min(6, Math.max(0.05, prev.scale * factor)) }));

  return (
    <div className="diagram-host">
      <div className="diagram-toolbar">
        {toolbar}
        <div style={{ flex: 1 }} />
        <button type="button" className="btn small ghost" onClick={() => zoom(1 / 1.2)} title={t('common.zoomOut')}>
          −
        </button>
        <span className="field-label" style={{ minWidth: 46, textAlign: 'center' }}>
          {Math.round(view.scale * 100)}%
        </span>
        <button type="button" className="btn small ghost" onClick={() => zoom(1.2)} title={t('common.zoomIn')}>
          +
        </button>
        <button type="button" className="btn small" onClick={fit}>
          {t('common.fit')}
        </button>
        <button type="button" className="btn small" onClick={() => setView({ x: 20, y: 20, scale: 1 })}>
          {t('common.zoomReset')}
        </button>
      </div>
      <div
        className={'diagram-canvas' + (drag.current ? ' panning' : '')}
        ref={hostRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {width && height ? (
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            style={{
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
              transformOrigin: '0 0',
            }}
          >
            {children}
          </svg>
        ) : null}
        {!width || !height ? <div className="diagram-empty">{emptyMessage || t('common.noData')}</div> : null}
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------- Tree */

export function CheckTree({ nodes, checked, onToggle, expanded, onExpand, renderMeta }) {
  return (
    <div className="tree">
      {nodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          checked={checked}
          onToggle={onToggle}
          expanded={expanded}
          onExpand={onExpand}
          renderMeta={renderMeta}
        />
      ))}
    </div>
  );
}

function TreeNode({ node, checked, onToggle, expanded, onExpand, renderMeta }) {
  const isOpen = expanded.has(node.path);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div>
      <div className="tree-node">
        {hasChildren ? (
          <button type="button" className="twisty" onClick={() => onExpand(node.path)}>
            {isOpen ? '▾' : '▸'}
          </button>
        ) : (
          <span className="twisty" />
        )}
        <label>
          <input type="checkbox" checked={checked.has(node.path)} onChange={() => onToggle(node)} />
          <span className="name" title={node.path}>
            {node.name}
          </span>
          <span className="count">{renderMeta ? renderMeta(node) : node.fileCount}</span>
        </label>
      </div>
      {hasChildren && isOpen ? (
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              checked={checked}
              onToggle={onToggle}
              expanded={expanded}
              onExpand={onExpand}
              renderMeta={renderMeta}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- charts */

export function BarList({ items, max, formatValue }) {
  const ceiling = max || Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="bar-list">
      {items.map((item) => (
        <div className="bar-row" key={item.label}>
          <span className="label" title={item.label}>
            {item.label}
          </span>
          <span className="track">
            <span
              className={'fill' + (item.tone ? ' ' + item.tone : '')}
              style={{ width: Math.max(1, Math.round((item.value / ceiling) * 100)) + '%' }}
            />
          </span>
          <span className="value">{formatValue ? formatValue(item.value) : Number(item.value).toLocaleString('en-US')}</span>
        </div>
      ))}
    </div>
  );
}

export function StatCard({ label, value, sub, tone }) {
  return (
    <div className="card">
      <h4>{label}</h4>
      <div className="value" style={tone ? { color: 'var(--' + tone + ')' } : undefined}>
        {typeof value === 'number' ? value.toLocaleString('en-US') : value}
      </div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}

export function SeverityBadge({ severity, children }) {
  const cls = severity === 'critical' ? 'critical' : severity === 'warning' ? 'warning' : severity === 'info' ? 'info' : 'neutral';
  return <span className={'badge ' + cls}>{children || severity}</span>;
}

/* ------------------------------------------------------------------ Toast */

export function Toast({ message, tone, onDismiss }) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(onDismiss, tone === 'error' ? 8000 : 3500);
    return () => clearTimeout(timer);
  }, [message, tone, onDismiss]);

  if (!message) return null;
  return (
    <div className={'toast' + (tone === 'error' ? ' error' : '')} role="status" onClick={onDismiss}>
      {message}
    </div>
  );
}

/** Wraps long text so a diagram label never overflows its box. */
export function wrapLabel(text, maxChars) {
  const words = String(text || '').split(/(?=[A-Z])|[\s_.-]+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    if ((current + word).length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current += (current ? '' : '') + word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [String(text || '')];
}

/** Truncates with an ellipsis at a character budget. */
export function ellipsize(text, maxChars) {
  const value = String(text || '');
  return value.length > maxChars ? value.slice(0, maxChars - 1) + '…' : value;
}
