// UML-style structure diagrams: class diagram (attributes + operations),
// inheritance-only diagram, and the ERD. They share the box renderer because
// all three are "a titled box with rows, connected by typed lines".

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DiagramCanvas, ellipsize } from '../components/common.jsx';
import { layoutGrid, layoutLayered, orthogonalPath } from '../components/layout.js';
import { baseName } from '../core/languages.js';

const BOX_WIDTH = 250;
const HEADER_HEIGHT = 34;
const ROW_HEIGHT = 16;
const SECTION_PAD = 6;

const KIND_MARK = { class: '', interface: '«interface»', struct: '«struct»', enum: '«enum»', module: '«module»' };

/* --------------------------------------------------------- class diagram */

export function ClassDiagramView({ result, diagramRef, onOpenSource, search, inheritanceOnly }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(null);
  const [maxTypes, setMaxTypes] = useState(80);

  const typeById = useMemo(() => new Map(result.typeMetrics.map((type) => [type.id, type])), [result]);

  const relations = useMemo(
    () => result.typeRelations.filter((rel) => !rel.external && (!inheritanceOnly || rel.kind === 'inheritance')),
    [result, inheritanceOnly],
  );

  // In inheritance mode only types that actually participate are worth drawing.
  const visibleTypes = useMemo(() => {
    let types = result.typeMetrics;
    if (inheritanceOnly) {
      const involved = new Set();
      for (const rel of relations) {
        involved.add(rel.fromId);
        involved.add(rel.toId);
      }
      types = types.filter((type) => involved.has(type.id));
    }
    if (search) {
      const needle = search.toLowerCase();
      const matching = types.filter((type) => type.displayName.toLowerCase().includes(needle));
      if (matching.length > 0) types = matching;
    }
    return [...types]
      .sort((a, b) => b.memberCount - a.memberCount || a.displayName.localeCompare(b.displayName))
      .slice(0, maxTypes);
  }, [result, relations, inheritanceOnly, search, maxTypes]);

  const layout = useMemo(() => {
    if (visibleTypes.length === 0) return null;

    if (inheritanceOnly) {
      const nodes = visibleTypes.map((type) => ({ id: type.id, displayName: type.displayName, type }));
      const edges = relations
        .filter((rel) => visibleTypes.some((tp) => tp.id === rel.fromId) && visibleTypes.some((tp) => tp.id === rel.toId))
        // Draw parent → child so the hierarchy reads downward.
        .map((rel) => ({ fromId: rel.toId, toId: rel.fromId, kind: rel.kind }));

      const laid = layoutLayered(nodes, edges, { nodeWidth: BOX_WIDTH, nodeHeight: HEADER_HEIGHT + 8, gapX: 60, gapY: 22 });
      return {
        boxes: laid.nodes.map((entry) => ({
          ...entry,
          type: entry.node.type,
          attributes: [],
          operations: [],
          height: HEADER_HEIGHT + 8,
        })),
        edges: laid.edges.map((edge) => ({ ...edge, kind: edge.kind })),
        width: laid.width,
        height: laid.height,
      };
    }

    const boxes = visibleTypes.map((type) => {
      const attributes = type.attributes.slice(0, 8);
      const operations = type.operations.slice(0, 8);
      return {
        id: type.id,
        type,
        attributes,
        operations,
        height:
          HEADER_HEIGHT +
          SECTION_PAD * 2 +
          Math.max(1, attributes.length) * ROW_HEIGHT +
          Math.max(1, operations.length) * ROW_HEIGHT +
          10,
      };
    });

    const grid = layoutGrid(boxes, { columnWidth: BOX_WIDTH, gapX: 56, gapY: 34, maxWidth: 1700 });
    const byId = new Map(grid.boxes.map((box) => [box.id, box]));
    const edges = relations
      .map((rel) => ({ from: byId.get(rel.fromId), to: byId.get(rel.toId), kind: rel.kind }))
      .filter((edge) => edge.from && edge.to);

    return { boxes: grid.boxes, edges, width: grid.width, height: grid.height };
  }, [visibleTypes, relations, inheritanceOnly]);

  const totalTypes = inheritanceOnly
    ? new Set(relations.flatMap((rel) => [rel.fromId, rel.toId])).size
    : result.typeMetrics.length;

  return (
    <DiagramCanvas
      ref={diagramRef}
      storageKey={inheritanceOnly ? 'inheritance' : 'classDiagram'}
      fitKey={(inheritanceOnly ? 'inheritance:' : 'classDiagram:') + maxTypes + ':' + (search || '')}
      width={layout ? layout.width : 0}
      height={layout ? layout.height : 0}
      onBackgroundClick={() => setSelected(null)}
      emptyMessage={t('common.noData')}
      toolbar={
        <>
          <span className="field-label">{inheritanceOnly ? t('views.inheritance') : t('views.classDiagram')}</span>
          <span className="field-label">
            {visibleTypes.length} / {totalTypes}
          </span>
          {totalTypes > visibleTypes.length ? (
            <button type="button" className="btn small" onClick={() => setMaxTypes((n) => n + 80)}>
              +80
            </button>
          ) : null}
          {selected && typeById.get(selected) ? (
            <span className="field-label">
              {typeById.get(selected).fullName} · LCOM {typeById.get(selected).lackOfCohesion} · DIT{' '}
              {typeById.get(selected).depthOfInheritance}
            </span>
          ) : null}
        </>
      }
    >
      {layout ? (
        <>
          <defs>
            <marker id="uml-inherit" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" orient="auto-start-reverse">
              <path d="M 0 0 L 12 6 L 0 12 z" fill="var(--diagram-bg)" stroke="var(--edge)" strokeWidth="1.2" />
            </marker>
            <marker id="uml-realize" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" orient="auto-start-reverse">
              <path d="M 0 0 L 12 6 L 0 12 z" fill="var(--diagram-bg)" stroke="var(--info)" strokeWidth="1.2" />
            </marker>
            <marker id="uml-hot" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="13" markerHeight="13" orient="auto-start-reverse">
              <path d="M 0 0 L 12 6 L 0 12 z" fill="var(--diagram-bg)" stroke="var(--edge-highlight)" strokeWidth="1.6" />
            </marker>
          </defs>
          {[...layout.edges]
            .map((edge, index) => ({
              edge,
              index,
              hot: !!selected && (edge.from.id === selected || edge.to.id === selected),
            }))
            .sort((a, b) => Number(a.hot) - Number(b.hot))
            .map(({ edge, index, hot }) => {
              const path = orthogonalPath(edge.from, edge.to);
              const realization = edge.kind === 'realization';
              return (
                <path
                  key={index}
                  d={path.d}
                  fill="none"
                  stroke={hot ? 'var(--edge-highlight)' : realization ? 'var(--info)' : 'var(--edge)'}
                  strokeWidth={hot ? 2.8 : 1.3}
                  strokeOpacity={selected && !hot ? 0.15 : 1}
                  strokeDasharray={realization ? '5 4' : undefined}
                  markerEnd={hot ? 'url(#uml-hot)' : realization ? 'url(#uml-realize)' : 'url(#uml-inherit)'}
                />
              );
            })}
          {layout.boxes.map((box) => (
            <UmlBox
              key={box.id}
              box={box}
              compact={!!inheritanceOnly}
              selected={selected === box.id}
              onSelect={() => setSelected(box.id)}
              onOpenSource={() => onOpenSource({ filePath: box.type.filePath, lineNumber: box.type.lineNumber })}
              search={search}
            />
          ))}
        </>
      ) : null}
    </DiagramCanvas>
  );
}

function UmlBox({ box, compact, selected, onSelect, onOpenSource, search }) {
  const type = box.type;
  const matched = search && type.displayName.toLowerCase().includes(search.toLowerCase());
  const warn = type.warnings.godType !== 'none' || type.warnings.typeCohesion !== 'none';
  const stroke = selected ? 'var(--accent)' : matched ? 'var(--warning)' : warn ? 'var(--warning)' : 'var(--node-stroke)';
  const mark = KIND_MARK[type.kind] || '';

  const attrTop = HEADER_HEIGHT;
  const attrHeight = SECTION_PAD + Math.max(1, box.attributes.length) * ROW_HEIGHT;

  return (
    <g data-node={box.id} transform={`translate(${box.x}, ${box.y})`} onClick={onSelect} onDoubleClick={onOpenSource} style={{ cursor: 'pointer' }}>
      <rect width={box.width} height={box.height} rx="6" fill="var(--node-fill)" stroke={stroke} strokeWidth={selected || matched ? 2 : 1} />
      <rect width={box.width} height={HEADER_HEIGHT} rx="6" fill="var(--bg-panel)" stroke="none" />
      <rect y={HEADER_HEIGHT - 6} width={box.width} height="6" fill="var(--bg-panel)" stroke="none" />
      <line x1="0" y1={HEADER_HEIGHT} x2={box.width} y2={HEADER_HEIGHT} stroke={stroke} strokeWidth="1" />

      {mark ? (
        <text x={box.width / 2} y="13" fill="var(--text-faint)" fontSize="9.5" textAnchor="middle">
          {mark}
        </text>
      ) : null}
      <text x={box.width / 2} y={mark ? 27 : 22} fill="var(--node-text)" fontSize="12.5" fontWeight="700" textAnchor="middle">
        {ellipsize(type.displayName, 28)}
      </text>

      {compact ? null : (
        <>
          {box.attributes.length === 0 ? (
            <text x="9" y={attrTop + 14} fill="var(--text-faint)" fontSize="10.5" fontStyle="italic">
              —
            </text>
          ) : (
            box.attributes.map((attr, index) => (
              <text key={index} x="9" y={attrTop + SECTION_PAD + 6 + index * ROW_HEIGHT} fill="var(--text-dim)" fontSize="10.5">
                − {ellipsize(attr.name + (attr.typeName ? ': ' + attr.typeName : ''), 32)}
              </text>
            ))
          )}
          <line x1="0" y1={attrTop + attrHeight} x2={box.width} y2={attrTop + attrHeight} stroke={stroke} strokeWidth="1" />
          {box.operations.length === 0 ? (
            <text x="9" y={attrTop + attrHeight + 14} fill="var(--text-faint)" fontSize="10.5" fontStyle="italic">
              —
            </text>
          ) : (
            box.operations.map((op, index) => (
              <text key={index} x="9" y={attrTop + attrHeight + SECTION_PAD + 6 + index * ROW_HEIGHT} fill="var(--text)" fontSize="10.5">
                + {ellipsize(op.name + '()', 32)}
              </text>
            ))
          )}
        </>
      )}
    </g>
  );
}

/* ------------------------------------------------------------------- ERD */

export function ErdView({ result, diagramRef, onOpenSource, search }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(null);
  const tables = result.schema.tables;

  const layout = useMemo(() => {
    if (tables.length === 0) return null;

    const filtered = search
      ? tables.filter((table) => table.name.toLowerCase().includes(search.toLowerCase())) || tables
      : tables;
    const list = filtered.length > 0 ? filtered : tables;

    const boxes = list.slice(0, 120).map((table) => {
      const columns = table.columns.slice(0, 14);
      return {
        id: table.id,
        table,
        columns,
        height: HEADER_HEIGHT + SECTION_PAD + Math.max(1, columns.length) * ROW_HEIGHT + 8,
      };
    });

    const grid = layoutGrid(boxes, { columnWidth: 260, gapX: 70, gapY: 34, maxWidth: 1700 });
    const byId = new Map(grid.boxes.map((box) => [box.id, box]));
    const edges = result.schema.relations
      .map((rel) => ({ from: byId.get(rel.fromTableId), to: byId.get(rel.toTableId), rel }))
      .filter((edge) => edge.from && edge.to);

    return { boxes: grid.boxes, edges, width: grid.width, height: grid.height };
  }, [tables, result, search]);

  return (
    <DiagramCanvas
      ref={diagramRef}
      storageKey="erd"
      fitKey={'erd:' + (search || '')}
      width={layout ? layout.width : 0}
      height={layout ? layout.height : 0}
      onBackgroundClick={() => setSelected(null)}
      emptyMessage={t('common.noData')}
      toolbar={
        <>
          <span className="field-label">{t('views.erd')}</span>
          <span className="field-label">
            {tables.length} tables · {result.schema.relations.length} relations
          </span>
        </>
      }
    >
      {layout ? (
        <>
          <defs>
            <marker id="erd-crow" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="11" markerHeight="11" orient="auto-start-reverse">
              <path d="M 0 1 L 11 6 L 0 11" fill="none" stroke="var(--edge)" strokeWidth="1.4" />
            </marker>
            <marker id="erd-crow-hot" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" orient="auto-start-reverse">
              <path d="M 0 1 L 11 6 L 0 11" fill="none" stroke="var(--edge-highlight)" strokeWidth="1.9" />
            </marker>
          </defs>
          {[...layout.edges]
            .map((edge, index) => ({
              edge,
              index,
              hot: !!selected && (edge.from.id === selected || edge.to.id === selected),
            }))
            .sort((a, b) => Number(a.hot) - Number(b.hot))
            .map(({ edge, index, hot }) => {
              const path = orthogonalPath(edge.from, edge.to);
              const inferred = edge.rel.kind === 'inferredReference';
              return (
                <path
                  key={index}
                  d={path.d}
                  fill="none"
                  stroke={hot ? 'var(--edge-highlight)' : inferred ? 'var(--text-faint)' : 'var(--edge)'}
                  strokeWidth={hot ? 2.8 : 1.3}
                  strokeOpacity={selected && !hot ? 0.15 : 1}
                  strokeDasharray={inferred ? '4 4' : undefined}
                  markerEnd={hot ? 'url(#erd-crow-hot)' : 'url(#erd-crow)'}
                />
              );
            })}
          {layout.boxes.map((box) => (
            <ErdBox
              key={box.id}
              box={box}
              selected={selected === box.id}
              onSelect={() => setSelected(box.id)}
              onOpenSource={() => onOpenSource({ filePath: box.table.filePath, lineNumber: box.table.lineNumber })}
            />
          ))}
        </>
      ) : null}
    </DiagramCanvas>
  );
}

function ErdBox({ box, selected, onSelect, onOpenSource }) {
  const table = box.table;
  return (
    <g data-node={box.id} transform={`translate(${box.x}, ${box.y})`} onClick={onSelect} onDoubleClick={onOpenSource} style={{ cursor: 'pointer' }}>
      <rect
        width={box.width}
        height={box.height}
        rx="6"
        fill="var(--node-fill)"
        stroke={selected ? 'var(--accent)' : 'var(--node-stroke)'}
        strokeWidth={selected ? 2 : 1}
      />
      <rect width={box.width} height={HEADER_HEIGHT} rx="6" fill="var(--bg-panel)" />
      <rect y={HEADER_HEIGHT - 6} width={box.width} height="6" fill="var(--bg-panel)" />
      <line x1="0" y1={HEADER_HEIGHT} x2={box.width} y2={HEADER_HEIGHT} stroke={selected ? 'var(--accent)' : 'var(--node-stroke)'} />
      <text x="10" y="16" fill="var(--node-text)" fontSize="12.5" fontWeight="700">
        {ellipsize(table.name, 26)}
      </text>
      <text x="10" y="28" fill="var(--text-faint)" fontSize="9.5">
        {table.sourceKind}
        {table.dialect !== 'unknown' ? ' · ' + table.dialect : ''}
      </text>
      {box.columns.map((column, index) => (
        <g key={column.name + index}>
          <text x="10" y={HEADER_HEIGHT + SECTION_PAD + 6 + index * ROW_HEIGHT} fill={column.isPrimaryKey ? 'var(--accent)' : 'var(--text)'} fontSize="10.5" fontWeight={column.isPrimaryKey ? 700 : 400}>
            {column.isPrimaryKey ? '🔑 ' : column.isForeignKey ? '↗ ' : '   '}
            {ellipsize(column.name, 22)}
          </text>
          <text x={box.width - 10} y={HEADER_HEIGHT + SECTION_PAD + 6 + index * ROW_HEIGHT} fill="var(--text-faint)" fontSize="9.5" textAnchor="end">
            {ellipsize(column.dataType || '', 14)}
          </text>
        </g>
      ))}
    </g>
  );
}

/* ------------------------------------------------- file / dir relations --*/

export function RelationGraphView({ result, diagramRef, onOpenSource, search, mode }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(null);
  const [limit, setLimit] = useState(60);

  const source = mode === 'directory' ? result.directoryRelations : result.fileRelations;

  const layout = useMemo(() => {
    if (source.nodes.length === 0) return null;

    const ranked = [...source.nodes]
      .sort((a, b) => b.fanIn + b.fanOut - (a.fanIn + a.fanOut))
      .slice(0, limit);
    const keep = new Set(ranked.map((node) => node.id));
    const edges = source.edges.filter((edge) => keep.has(edge.fromId) && keep.has(edge.toId));

    return layoutLayered(
      ranked.map((node) => ({ ...node, displayName: node.displayName })),
      edges,
      { nodeWidth: 210, nodeHeight: 44, gapX: 90, gapY: 22, maxPerLayer: 30 },
    );
  }, [source, limit]);

  return (
    <DiagramCanvas
      ref={diagramRef}
      storageKey={'relations:' + mode}
      fitKey={'relations:' + mode + ':' + limit}
      width={layout ? layout.width : 0}
      height={layout ? layout.height : 0}
      onBackgroundClick={() => setSelected(null)}
      emptyMessage={t('common.noData')}
      toolbar={
        <>
          <span className="field-label">{mode === 'directory' ? t('views.directoryRelations') : t('views.fileRelations')}</span>
          <span className="field-label">
            {layout ? layout.nodes.length : 0} / {source.nodes.length}
          </span>
          {source.nodes.length > limit ? (
            <button type="button" className="btn small" onClick={() => setLimit((n) => n + 60)}>
              +60
            </button>
          ) : null}
        </>
      }
    >
      {layout ? (
        <>
          <defs>
            <marker id="rel-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--edge)" />
            </marker>
            <marker id="rel-arrow-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--edge-highlight)" />
            </marker>
          </defs>
          {[...layout.edges]
            .map((edge, index) => ({ edge, index, hot: selected === edge.fromId || selected === edge.toId }))
            .sort((a, b) => Number(a.hot) - Number(b.hot))
            .map(({ edge, index, hot }) => {
              const path = orthogonalPath(edge.from, edge.to);
              const weightWidth = Math.min(4, 0.8 + Math.log2(edge.weight + 1));
              return (
                <path
                  key={index}
                  d={path.d}
                  fill="none"
                  stroke={hot ? 'var(--edge-highlight)' : 'var(--edge)'}
                  // A highlighted edge is always clearly thick, even when its
                  // own call weight is low.
                  strokeWidth={hot ? Math.max(3.4, weightWidth + 1.8) : weightWidth}
                  markerEnd={hot ? 'url(#rel-arrow-hot)' : 'url(#rel-arrow)'}
                  strokeOpacity={selected && !hot ? 0.15 : 1}
                />
              );
            })}
          {layout.nodes.map((entry) => {
            const node = entry.node;
            const matched = search && node.displayName.toLowerCase().includes(search.toLowerCase());
            const connected =
              !selected ||
              selected === node.id ||
              layout.edges.some(
                (edge) =>
                  (edge.fromId === selected && edge.toId === node.id) ||
                  (edge.toId === selected && edge.fromId === node.id),
              );
            return (
              <g
                key={node.id}
                data-node={node.id}
                opacity={connected ? 1 : 0.35}
                transform={`translate(${entry.x}, ${entry.y})`}
                onClick={() => setSelected(node.id)}
                onDoubleClick={() => mode !== 'directory' && onOpenSource({ filePath: node.filePath, lineNumber: 1 })}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  width={entry.width}
                  height={entry.height}
                  rx="7"
                  fill={selected === node.id ? 'var(--bg-active)' : 'var(--node-fill)'}
                  stroke={selected === node.id ? 'var(--accent)' : matched ? 'var(--warning)' : 'var(--node-stroke)'}
                  strokeWidth={selected === node.id || matched ? 2 : 1}
                />
                <text x="10" y="19" fill="var(--node-text)" fontSize="12" fontWeight="600">
                  {ellipsize(node.displayName, 26)}
                </text>
                <text x="10" y="34" fill="var(--text-faint)" fontSize="10">
                  in {node.fanIn} · out {node.fanOut} ·{' '}
                  {mode === 'directory' ? node.fileCount + ' files' : node.functionCount + ' fn'}
                </text>
              </g>
            );
          })}
        </>
      ) : null}
    </DiagramCanvas>
  );
}

export { baseName };
