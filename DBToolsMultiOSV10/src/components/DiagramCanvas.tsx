// Interactive ER canvas — port of Controls/DiagramCanvas.cs input handling.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DbRelationship, DbSchema, DbTable, RelationshipLineStyle, ToolMode } from '../types';
import {
  clamp,
  getAllTablesBounds,
  getColumnIndexAt,
  getTableBounds,
  getTableHeight,
  MAX_ZOOM,
  MIN_ZOOM,
  rectContains,
  type Point,
} from '../core/geometry';
import {
  getPathPoints,
  getRelationshipConnection,
  hitTestPath,
  hitTestRoutePoint,
  resetOrthogonalRoutesForTable,
  resetRoutePoints,
  tryInsertOrthogonalBend,
} from '../core/relationshipPath';
import { cloneSchema, findTable, newColumn, newTable } from '../core/schema';
import { fitTableWidthForTarget } from '../core/layout';
import { drawGrid, drawRelationPreview, drawSchema } from '../render/drawDiagram';
import { getPalette, type ThemeId } from '../render/theme';
import { useT } from '../i18n';
import { CanvasRuler, RULER_SIZE } from './CanvasRuler';
// The app icon, shown on the welcome screen while the diagram is still empty.
import appIcon from '../../build/icons/256x256.png';

export interface CanvasContextMenuRequest {
  screenX: number;
  screenY: number;
  canvasPoint: Point;
  table: DbTable | null;
  columnIndex: number;
  relationship: DbRelationship | null;
}

interface Props {
  schema: DbSchema;
  theme: ThemeId;
  tool: ToolMode;
  zoom: number;
  offsetX: number;
  offsetY: number;
  showGrid: boolean;
  snapToGrid: boolean;
  snapInterval: number;
  defaultLineStyle: RelationshipLineStyle;
  selectedTableId: string | null;
  selectedColumnId: string | null;
  selectedRelationshipId: string | null;
  highlightedColumnIds: Set<string>;
  onViewportChange: (v: { zoom: number; offsetX: number; offsetY: number }) => void;
  onSelectTable: (tableId: string | null, columnId?: string | null) => void;
  onSelectRelationship: (relationshipId: string | null) => void;
  onMutate: (mutator: (draft: DbSchema) => void, options?: { undo?: boolean }) => void;
  /** Live drag updates that should not each push an undo snapshot. */
  onDragUpdate: (mutator: (draft: DbSchema) => void) => void;
  onToolReset: () => void;
  onEditTable: (tableId: string) => void;
  onEditRelationship: (relationshipId: string) => void;
  onEditColumn: (tableId: string, columnId: string) => void;
  onContextMenu: (request: CanvasContextMenuRequest) => void;
  onRelationRequested: (sourceTableId: string, targetTableId: string) => void;
}

type DragKind =
  | { kind: 'none' }
  | { kind: 'pan'; startScreen: Point; startOffset: Point }
  | { kind: 'table'; tableId: string; grabOffset: Point }
  | { kind: 'routePoint'; relationshipId: string; index: number }
  | { kind: 'segment'; relationshipId: string; index: number; origin: Point; originPoints: Point[] }
  | { kind: 'relation'; sourceTableId: string; current: Point };

export function DiagramCanvas(props: Props) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [drag, setDrag] = useState<DragKind>({ kind: 'none' });
  const [spacePressed, setSpacePressed] = useState(false);
  const [cursor, setCursor] = useState('default');

  const { schema, zoom, offsetX, offsetY, theme } = props;
  const palette = getPalette(theme);

  // ── Coordinate conversion ──────────────────────────────────────────────────

  const toCanvasPoint = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - RULER_SIZE + offsetX) / zoom,
        y: (clientY - rect.top - RULER_SIZE + offsetY) / zoom,
      };
    },
    [offsetX, offsetY, zoom],
  );

  const snap = useCallback(
    (value: number): number =>
      props.snapToGrid ? Math.round(value / props.snapInterval) * props.snapInterval : value,
    [props.snapToGrid, props.snapInterval],
  );

  // ── Sizing ─────────────────────────────────────────────────────────────────

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setSize({
        width: Math.max(0, element.clientWidth - RULER_SIZE),
        height: Math.max(0, element.clientHeight - RULER_SIZE),
      });
    });
    observer.observe(element);
    setSize({
      width: Math.max(0, element.clientWidth - RULER_SIZE),
      height: Math.max(0, element.clientHeight - RULER_SIZE),
    });
    return () => observer.disconnect();
  }, []);

  // ── Painting ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0 || size.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = palette.canvasBackground;
    ctx.fillRect(0, 0, size.width, size.height);

    ctx.save();
    ctx.translate(-offsetX, -offsetY);
    ctx.scale(zoom, zoom);

    if (props.showGrid) {
      drawGrid(
        ctx,
        palette,
        offsetX / zoom,
        offsetY / zoom,
        size.width / zoom,
        size.height / zoom,
        zoom,
        props.snapInterval,
      );
    }

    drawSchema(ctx, schema, {
      palette,
      zoom,
      selectedTableId: props.selectedTableId,
      selectedColumnId: props.selectedColumnId,
      selectedRelationshipId: props.selectedRelationshipId,
      highlightedColumnIds: props.highlightedColumnIds,
      liveRouteTableId: drag.kind === 'table' ? drag.tableId : null,
    });

    if (drag.kind === 'relation') {
      const source = findTable(schema, drag.sourceTableId);
      if (source) {
        const bounds = getTableBounds(source);
        const center = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
        drawRelationPreview(ctx, center, drag.current, zoom);
      }
    }

    ctx.restore();
  }, [schema, size, zoom, offsetX, offsetY, palette, drag, props.showGrid, props.snapInterval,
      props.selectedTableId, props.selectedColumnId, props.selectedRelationshipId,
      props.highlightedColumnIds]);

  // ── Hit testing ────────────────────────────────────────────────────────────

  const hitTable = useCallback(
    (p: Point): DbTable | null => {
      for (let i = schema.Tables.length - 1; i >= 0; i--) {
        if (rectContains(getTableBounds(schema.Tables[i]), p)) return schema.Tables[i];
      }
      return null;
    },
    [schema],
  );

  const hitRelationship = useCallback(
    (p: Point): DbRelationship | null => {
      const tolerance = 6 / zoom;
      for (let i = schema.Relationships.length - 1; i >= 0; i--) {
        const rel = schema.Relationships[i];
        const connection = getRelationshipConnection(schema, rel);
        if (connection && hitTestPath(rel, p, connection, tolerance)) return rel;
      }
      return null;
    },
    [schema, zoom],
  );

  /** Route handle of the currently selected relationship under `p`, if any. */
  const hitSelectedRouteHandle = useCallback(
    (p: Point): { relationshipId: string; index: number } | null => {
      const rel = schema.Relationships.find((r) => r.Id === props.selectedRelationshipId);
      if (!rel || rel.LineStyle === 'Straight') return null;
      const connection = getRelationshipConnection(schema, rel);
      if (!connection) return null;
      const index = hitTestRoutePoint(rel, p, connection, 8 / zoom);
      return index >= 0 ? { relationshipId: rel.Id, index } : null;
    },
    [schema, props.selectedRelationshipId, zoom],
  );

  /** Orthogonal segment midpoint handle of the selected relationship. */
  const hitSelectedSegment = useCallback(
    (p: Point): { relationshipId: string; index: number; points: Point[] } | null => {
      const rel = schema.Relationships.find((r) => r.Id === props.selectedRelationshipId);
      if (!rel || rel.LineStyle !== 'Orthogonal') return null;
      const connection = getRelationshipConnection(schema, rel);
      if (!connection) return null;
      const points = getPathPoints(rel, connection);
      const radius = 7 / zoom;
      for (let i = 0; i < points.length - 1; i++) {
        const mid = {
          x: (points[i].x + points[i + 1].x) * 0.5,
          y: (points[i].y + points[i + 1].y) * 0.5,
        };
        if (Math.abs(p.x - mid.x) <= radius && Math.abs(p.y - mid.y) <= radius) {
          return { relationshipId: rel.Id, index: i, points };
        }
      }
      return null;
    },
    [schema, props.selectedRelationshipId, zoom],
  );

  // ── Mouse handling ─────────────────────────────────────────────────────────

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toCanvasPoint(e.clientX, e.clientY);
    canvasRef.current?.focus();

    // Right button: never start a drag here. The menu is opened from the
    // `contextmenu` event instead, which fires after this mousedown — opening
    // it here would let that same mousedown reach the menu's own
    // close-on-outside-click handler and dismiss it instantly.
    if (e.button === 2) return;

    if (e.button === 1 || (spacePressed && e.button === 0)) {
      setDrag({
        kind: 'pan',
        startScreen: { x: e.clientX, y: e.clientY },
        startOffset: { x: offsetX, y: offsetY },
      });
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (e.button !== 0) return;

    if (props.tool === 'AddTable') {
      props.onMutate((draft) => {
        const table = newTable({
          Name: `${t('NewTableName')}_${draft.Tables.length + 1}`,
          X: snap(p.x),
          Y: snap(p.y),
          Columns: [
            newColumn({
              Name: 'id',
              DataType: draft.TargetDb === 'PostgreSQL' ? 'SERIAL' : 'INTEGER',
              IsPrimaryKey: true,
              IsAutoIncrement: true,
              IsNullable: false,
            }),
          ],
        });
        fitTableWidthForTarget(table, draft.TargetDb);
        draft.Tables.push(table);
      });
      props.onToolReset();
      return;
    }

    const isRelationTool = props.tool.startsWith('Relation');
    const table = hitTable(p);

    if (isRelationTool) {
      if (table) {
        setDrag({ kind: 'relation', sourceTableId: table.Id, current: p });
        e.currentTarget.setPointerCapture(e.pointerId);
      } else {
        setDrag({
          kind: 'pan',
          startScreen: { x: e.clientX, y: e.clientY },
          startOffset: { x: offsetX, y: offsetY },
        });
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      return;
    }

    // Select tool: route handles take priority over the shapes underneath.
    const routeHandle = hitSelectedRouteHandle(p);
    if (routeHandle) {
      props.onMutate(() => {}, { undo: true });
      setDrag({ kind: 'routePoint', ...routeHandle });
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    const segment = hitSelectedSegment(p);
    if (segment) {
      props.onMutate(() => {}, { undo: true });
      setDrag({
        kind: 'segment',
        relationshipId: segment.relationshipId,
        index: segment.index,
        origin: p,
        originPoints: segment.points,
      });
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (table) {
      const columnIndex = getColumnIndexAt(table, p);
      props.onSelectTable(table.Id, columnIndex >= 0 ? table.Columns[columnIndex].Id : null);
      props.onMutate(() => {}, { undo: true });
      setDrag({
        kind: 'table',
        tableId: table.Id,
        grabOffset: { x: p.x - table.X, y: p.y - table.Y },
      });
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    const rel = hitRelationship(p);
    if (rel) {
      props.onSelectRelationship(rel.Id);
      return;
    }

    props.onSelectTable(null, null);
    setDrag({
      kind: 'pan',
      startScreen: { x: e.clientX, y: e.clientY },
      startOffset: { x: offsetX, y: offsetY },
    });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toCanvasPoint(e.clientX, e.clientY);

    switch (drag.kind) {
      case 'pan':
        props.onViewportChange({
          zoom,
          offsetX: drag.startOffset.x - (e.clientX - drag.startScreen.x),
          offsetY: drag.startOffset.y - (e.clientY - drag.startScreen.y),
        });
        return;

      case 'table':
        props.onDragUpdate((draft) => {
          const table = findTable(draft, drag.tableId);
          if (!table) return;
          table.X = snap(p.x - drag.grabOffset.x);
          table.Y = snap(p.y - drag.grabOffset.y);
          resetOrthogonalRoutesForTable(draft, table.Id);
        });
        return;

      case 'routePoint':
        props.onDragUpdate((draft) => {
          const rel = draft.Relationships.find((r) => r.Id === drag.relationshipId);
          if (!rel || !rel.RoutePoints[drag.index]) return;
          rel.RoutePoints[drag.index] = { X: snap(p.x), Y: snap(p.y) };
        });
        return;

      case 'segment': {
        const dx = p.x - drag.origin.x;
        const dy = p.y - drag.origin.y;
        const a = drag.originPoints[drag.index];
        const b = drag.originPoints[drag.index + 1];
        const horizontal = Math.abs(a.y - b.y) < 0.5;
        props.onDragUpdate((draft) => {
          const rel = draft.Relationships.find((r) => r.Id === drag.relationshipId);
          if (!rel) return;
          // Route points sit between the two endpoints, so segment i touches
          // route indices i-1 and i.
          for (const routeIndex of [drag.index - 1, drag.index]) {
            const rp = rel.RoutePoints[routeIndex];
            if (!rp) continue;
            if (horizontal) rp.Y = snap(rp.Y + dy);
            else rp.X = snap(rp.X + dx);
          }
        });
        return;
      }

      case 'relation':
        setDrag({ ...drag, current: p });
        return;

      default:
        break;
    }

    // Idle: reflect what is under the pointer in the cursor.
    if (spacePressed) {
      setCursor('grab');
    } else if (props.tool === 'AddTable') {
      setCursor('crosshair');
    } else if (props.tool.startsWith('Relation')) {
      setCursor('crosshair');
    } else if (hitSelectedRouteHandle(p) || hitSelectedSegment(p)) {
      setCursor('move');
    } else if (hitTable(p)) {
      setCursor('move');
    } else if (hitRelationship(p)) {
      setCursor('pointer');
    } else {
      setCursor('default');
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (drag.kind === 'relation') {
      const p = toCanvasPoint(e.clientX, e.clientY);
      const target = hitTable(p);
      if (target && target.Id !== drag.sourceTableId) {
        props.onRelationRequested(drag.sourceTableId, target.Id);
      }
      props.onToolReset();
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDrag({ kind: 'none' });
  };

  /**
   * Right-click menu. Driven by the `contextmenu` event rather than pointerdown
   * so the browser's own menu is suppressed and the opening click cannot also
   * dismiss the menu we are about to show.
   */
  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const p = toCanvasPoint(e.clientX, e.clientY);
    const table = hitTable(p);
    props.onContextMenu({
      screenX: e.clientX,
      screenY: e.clientY,
      canvasPoint: p,
      table,
      columnIndex: table ? getColumnIndexAt(table, p) : -1,
      relationship: table ? null : hitRelationship(p),
    });
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const p = toCanvasPoint(e.clientX, e.clientY);
    const table = hitTable(p);
    if (table) {
      const columnIndex = getColumnIndexAt(table, p);
      if (columnIndex >= 0) props.onEditColumn(table.Id, table.Columns[columnIndex].Id);
      else props.onEditTable(table.Id);
      return;
    }
    const rel = hitRelationship(p);
    if (rel) props.onEditRelationship(rel.Id);
  };

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!containerRef.current) return;
      e.preventDefault();
      const rect = containerRef.current.getBoundingClientRect();
      const anchorX = e.clientX - rect.left - RULER_SIZE;
      const anchorY = e.clientY - rect.top - RULER_SIZE;

      if (e.ctrlKey || e.metaKey || !e.shiftKey) {
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        const nextZoom = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM);
        if (Math.abs(nextZoom - zoom) < 0.0001) return;
        // Keep the point under the cursor fixed.
        const worldX = (anchorX + offsetX) / zoom;
        const worldY = (anchorY + offsetY) / zoom;
        props.onViewportChange({
          zoom: nextZoom,
          offsetX: worldX * nextZoom - anchorX,
          offsetY: worldY * nextZoom - anchorY,
        });
      } else {
        props.onViewportChange({ zoom, offsetX: offsetX + e.deltaY, offsetY });
      }
    },
    [zoom, offsetX, offsetY, props],
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Space-to-pan
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isEditableTarget(e.target)) setSpacePressed(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpacePressed(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const hasTables = schema.Tables.length > 0;

  return (
    <div className="canvas-host" ref={containerRef}>
      <CanvasRuler
        orientation="corner"
        palette={palette}
        zoom={zoom}
        offset={0}
        length={0}
      />
      <CanvasRuler
        orientation="horizontal"
        palette={palette}
        zoom={zoom}
        offset={offsetX}
        length={size.width}
      />
      <CanvasRuler
        orientation="vertical"
        palette={palette}
        zoom={zoom}
        offset={offsetY}
        length={size.height}
      />
      <canvas
        ref={canvasRef}
        className="diagram-canvas"
        tabIndex={0}
        style={{ cursor: drag.kind === 'pan' ? 'grabbing' : cursor }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      />
      {!hasTables && (
        <div className="canvas-empty">
          <img className="canvas-empty-icon" src={appIcon} alt="" width={96} height={96} draggable={false} />
          <div className="canvas-empty-title">DBTools</div>
          <div className="canvas-empty-tagline">{t('CanvasWelcomeTagline')}</div>
          <div className="canvas-empty-hint">{t('CanvasNoTables')}</div>
        </div>
      )}
    </div>
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/** Fit every table into `size`, returning the viewport that shows them all. */
export function computeFitViewport(
  schema: DbSchema,
  width: number,
  height: number,
): { zoom: number; offsetX: number; offsetY: number } | null {
  const bounds = getAllTablesBounds(schema);
  if (!bounds || bounds.w <= 0 || bounds.h <= 0 || width <= 0 || height <= 0) return null;
  const margin = 40;
  const zoom = clamp(
    Math.min((width - margin * 2) / bounds.w, (height - margin * 2) / bounds.h),
    MIN_ZOOM,
    MAX_ZOOM,
  );
  return {
    zoom,
    offsetX: bounds.x * zoom - (width - bounds.w * zoom) / 2,
    offsetY: bounds.y * zoom - (height - bounds.h * zoom) / 2,
  };
}

/** Re-route an orthogonal relationship from scratch. */
export function resetRelationshipRoute(schema: DbSchema, relationshipId: string): DbSchema {
  const draft = cloneSchema(schema);
  const rel = draft.Relationships.find((r) => r.Id === relationshipId);
  if (!rel) return draft;
  rel.RoutePoints = [];
  const connection = getRelationshipConnection(draft, rel);
  if (connection) resetRoutePoints(rel, connection);
  return draft;
}

/** Insert a new bend into an orthogonal relationship at `point`. */
export function insertBend(schema: DbSchema, relationshipId: string, point: Point): boolean {
  const rel = schema.Relationships.find((r) => r.Id === relationshipId);
  if (!rel) return false;
  const connection = getRelationshipConnection(schema, rel);
  if (!connection) return false;
  return tryInsertOrthogonalBend(rel, point, connection) >= 0;
}

export { getTableHeight };
