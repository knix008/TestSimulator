// Sequence diagram and data/control flow — the two views that answer
// "what happens when this runs" rather than "how is this organized".

import React, { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DiagramCanvas, ellipsize } from '../components/common.jsx';
import { buildSequence, buildDataFlow } from '../core/relations.js';
import { baseName } from '../core/languages.js';

const LIFELINE_WIDTH = 190;
const LIFELINE_GAP = 40;
const HEAD_HEIGHT = 46;
const MESSAGE_GAP = 34;
const PAGE_SIZE = 60;

export function SequenceDiagramView({ result, diagramRef, onOpenSource }) {
  const { t } = useTranslation();
  const graph = result.graph;

  const roots = useMemo(() => {
    const ids = graph.entryPointIds.length > 0 ? graph.entryPointIds : graph.nodes.slice(0, 100).map((n) => n.id);
    return ids.map((id) => graph.nodeMap.get(id)).filter(Boolean);
  }, [graph]);

  const [rootId, setRootId] = useState(() => (roots[0] ? roots[0].id : null));
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (roots.length > 0 && (!rootId || !graph.nodeMap.has(rootId))) setRootId(roots[0].id);
  }, [roots, rootId, graph]);

  useEffect(() => setPage(0), [rootId]);

  const sequence = useMemo(() => {
    if (!rootId) return null;
    return buildSequence(graph, rootId, result.functions);
  }, [graph, rootId, result.functions]);

  const pageCount = sequence ? Math.max(1, Math.ceil(sequence.messages.length / PAGE_SIZE)) : 1;
  const pageMessages = sequence ? sequence.messages.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : [];

  const width = sequence ? Math.max(600, sequence.participants.length * (LIFELINE_WIDTH + LIFELINE_GAP) + 40) : 0;
  const height = sequence ? HEAD_HEIGHT + 40 + Math.max(1, pageMessages.length) * MESSAGE_GAP + 40 : 0;

  const lifelineX = (index) => 24 + index * (LIFELINE_WIDTH + LIFELINE_GAP) + LIFELINE_WIDTH / 2;

  if (roots.length === 0) return <div className="empty-state">{t('common.noData')}</div>;

  return (
    <DiagramCanvas
      ref={diagramRef}
      storageKey="sequence"
      fitKey={'sequence:' + (rootId || '') + ':' + page}
      width={width}
      height={height}
      emptyMessage={t('common.noData')}
      toolbar={
        <>
          <span className="field-label">{t('common.entryPoint')}</span>
          <select className="input" style={{ maxWidth: 340 }} value={rootId || ''} onChange={(e) => setRootId(e.target.value)}>
            {roots.map((node) => (
              <option key={node.id} value={node.id}>
                {node.displayName} — {baseName(node.filePath)}
              </option>
            ))}
          </select>
          {pageCount > 1 ? (
            <>
              <button type="button" className="btn small" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                ◀
              </button>
              <span className="field-label">
                {page + 1} / {pageCount}
              </span>
              <button type="button" className="btn small" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>
                ▶
              </button>
            </>
          ) : null}
          {sequence && sequence.truncated ? <span className="badge warning">truncated</span> : null}
        </>
      }
    >
      {sequence && sequence.participants.length > 0 ? (
        <>
          <defs>
            <marker id="seq-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--edge)" />
            </marker>
          </defs>

          {sequence.participants.map((participant, index) => (
            <g key={participant.id} data-node={participant.id}>
              <rect
                x={24 + index * (LIFELINE_WIDTH + LIFELINE_GAP)}
                y="14"
                width={LIFELINE_WIDTH}
                height={HEAD_HEIGHT - 8}
                rx="6"
                fill="var(--node-fill)"
                stroke="var(--node-stroke)"
              />
              <text x={lifelineX(index)} y="38" fill="var(--node-text)" fontSize="12" fontWeight="600" textAnchor="middle">
                {ellipsize(participant.displayName, 24)}
              </text>
              <line
                x1={lifelineX(index)}
                y1={HEAD_HEIGHT + 6}
                x2={lifelineX(index)}
                y2={height - 20}
                stroke="var(--border-strong)"
                strokeDasharray="5 5"
              />
            </g>
          ))}

          {pageMessages.map((message, index) => {
            const y = HEAD_HEIGHT + 34 + index * MESSAGE_GAP;
            const x1 = lifelineX(message.from);
            const x2 = lifelineX(message.to);
            const selfCall = message.from === message.to;

            if (selfCall) {
              return (
                <g key={index} data-node={'msg' + index} onDoubleClick={() => onOpenSource(message)} style={{ cursor: 'pointer' }}>
                  <path
                    d={`M ${x1} ${y} h 34 v 16 h -34`}
                    fill="none"
                    stroke="var(--edge)"
                    strokeWidth="1.3"
                    markerEnd="url(#seq-arrow)"
                  />
                  <text x={x1 + 42} y={y + 4} fill="var(--text)" fontSize="11">
                    {ellipsize(message.label, 26)}
                  </text>
                </g>
              );
            }

            return (
              <g key={index} data-node={'msg' + index} onDoubleClick={() => onOpenSource(message)} style={{ cursor: 'pointer' }}>
                <line x1={x1} y1={y} x2={x2} y2={y} stroke={message.recursive ? 'var(--warning)' : 'var(--edge)'} strokeWidth="1.3" markerEnd="url(#seq-arrow)" />
                <text
                  x={(x1 + x2) / 2}
                  y={y - 6}
                  fill="var(--text)"
                  fontSize="11"
                  textAnchor="middle"
                >
                  {ellipsize(message.label, 30)}
                  {message.recursive ? ' ↻' : ''}
                </text>
              </g>
            );
          })}
        </>
      ) : null}
    </DiagramCanvas>
  );
}

/* ------------------------------------------------------------ data flow */

const FLOW_NODE_WIDTH = 200;
const FLOW_NODE_HEIGHT = 38;
const FLOW_GAP = 14;

export function DataFlowView({ result, diagramRef, onOpenSource, search }) {
  const { t } = useTranslation();

  const candidates = useMemo(() => {
    return [...result.functions]
      .sort((a, b) => b.fanIn + b.fanOut - (a.fanIn + a.fanOut))
      .slice(0, 400);
  }, [result.functions]);

  const [focusId, setFocusId] = useState(() => (candidates[0] ? candidates[0].id : null));

  useEffect(() => {
    if (candidates.length > 0 && !candidates.some((fn) => fn.id === focusId)) setFocusId(candidates[0].id);
  }, [candidates, focusId]);

  const flow = useMemo(() => {
    if (!focusId) return null;
    return buildDataFlow(result.graph, focusId, {
      functions: result.functions,
      globalAccesses: result.globalAccesses,
      tableAccesses: result.schema.accesses,
      tables: result.schema.tables,
    });
  }, [result, focusId]);

  if (!flow) return <div className="empty-state">{t('common.noData')}</div>;

  const rows = Math.max(flow.inputs.length, flow.outputs.length, 1);
  const width = FLOW_NODE_WIDTH * 3 + 200;
  const height = Math.max(240, rows * (FLOW_NODE_HEIGHT + FLOW_GAP) + 90);
  const columnX = [30, FLOW_NODE_WIDTH + 110, FLOW_NODE_WIDTH * 2 + 190];
  const centerY = height / 2 - FLOW_NODE_HEIGHT / 2;

  const nodeY = (index, count) => 60 + index * (FLOW_NODE_HEIGHT + FLOW_GAP) + (rows - count) * ((FLOW_NODE_HEIGHT + FLOW_GAP) / 2);

  const toneOf = (kind) => (kind === 'global' ? 'var(--warning)' : kind === 'table' ? 'var(--info)' : 'var(--node-stroke)');

  return (
    <DiagramCanvas
      ref={diagramRef}
      storageKey="dataFlow"
      fitKey={'dataFlow:' + (focusId || '')}
      width={width}
      height={height}
      emptyMessage={t('common.noData')}
      toolbar={
        <>
          <span className="field-label">{t('views.dataFlow')}</span>
          <select className="input" style={{ maxWidth: 380 }} value={focusId || ''} onChange={(e) => setFocusId(e.target.value)}>
            {candidates
              .filter((fn) => !search || fn.displayName.toLowerCase().includes(search.toLowerCase()))
              .map((fn) => (
                <option key={fn.id} value={fn.id}>
                  {fn.displayName} — {baseName(fn.filePath)}:{fn.startLine}
                </option>
              ))}
          </select>
        </>
      }
    >
      <defs>
        <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--edge)" />
        </marker>
      </defs>

      <text x={columnX[0]} y="34" fill="var(--text-dim)" fontSize="11.5" fontWeight="600">
        입력 / Inputs ({flow.inputs.length})
      </text>
      <text x={columnX[2]} y="34" fill="var(--text-dim)" fontSize="11.5" fontWeight="600">
        출력 / Outputs ({flow.outputs.length})
      </text>

      {flow.inputs.map((item, index) => {
        const y = nodeY(index, flow.inputs.length);
        return (
          <g key={'in' + item.kind + item.id} data-node={'in' + index}>
            <rect x={columnX[0]} y={y} width={FLOW_NODE_WIDTH} height={FLOW_NODE_HEIGHT} rx="7" fill="var(--node-fill)" stroke={toneOf(item.kind)} />
            <text x={columnX[0] + 10} y={y + 17} fill="var(--node-text)" fontSize="11.5">
              {ellipsize(item.label, 24)}
            </text>
            <text x={columnX[0] + 10} y={y + 30} fill="var(--text-faint)" fontSize="10">
              {item.detail}
            </text>
            <path
              d={`M ${columnX[0] + FLOW_NODE_WIDTH} ${y + FLOW_NODE_HEIGHT / 2} C ${columnX[0] + FLOW_NODE_WIDTH + 40} ${y + FLOW_NODE_HEIGHT / 2}, ${columnX[1] - 40} ${centerY + FLOW_NODE_HEIGHT / 2}, ${columnX[1]} ${centerY + FLOW_NODE_HEIGHT / 2}`}
              fill="none"
              stroke="var(--edge)"
              strokeWidth="1.2"
              markerEnd="url(#flow-arrow)"
            />
          </g>
        );
      })}

      <g data-node="focus" onDoubleClick={() => onOpenSource(flow.focus)} style={{ cursor: 'pointer' }}>
        <rect x={columnX[1]} y={centerY} width={FLOW_NODE_WIDTH} height={FLOW_NODE_HEIGHT + 14} rx="8" fill="var(--bg-active)" stroke="var(--accent)" strokeWidth="2" />
        <text x={columnX[1] + FLOW_NODE_WIDTH / 2} y={centerY + 21} fill="var(--node-text)" fontSize="13" fontWeight="700" textAnchor="middle">
          {ellipsize(flow.focus.label, 22)}
        </text>
        <text x={columnX[1] + FLOW_NODE_WIDTH / 2} y={centerY + 37} fill="var(--text-faint)" fontSize="10" textAnchor="middle">
          {ellipsize(baseName(flow.focus.filePath), 24)}:{flow.focus.lineNumber}
        </text>
      </g>

      {flow.outputs.map((item, index) => {
        const y = nodeY(index, flow.outputs.length);
        return (
          <g key={'out' + item.kind + item.id} data-node={'out' + index}>
            <path
              d={`M ${columnX[1] + FLOW_NODE_WIDTH} ${centerY + FLOW_NODE_HEIGHT / 2} C ${columnX[1] + FLOW_NODE_WIDTH + 40} ${centerY + FLOW_NODE_HEIGHT / 2}, ${columnX[2] - 40} ${y + FLOW_NODE_HEIGHT / 2}, ${columnX[2]} ${y + FLOW_NODE_HEIGHT / 2}`}
              fill="none"
              stroke="var(--edge)"
              strokeWidth="1.2"
              markerEnd="url(#flow-arrow)"
            />
            <rect x={columnX[2]} y={y} width={FLOW_NODE_WIDTH} height={FLOW_NODE_HEIGHT} rx="7" fill="var(--node-fill)" stroke={toneOf(item.kind)} />
            <text x={columnX[2] + 10} y={y + 17} fill="var(--node-text)" fontSize="11.5">
              {ellipsize(item.label, 24)}
            </text>
            <text x={columnX[2] + 10} y={y + 30} fill="var(--text-faint)" fontSize="10">
              {item.detail}
            </text>
          </g>
        );
      })}
    </DiagramCanvas>
  );
}
