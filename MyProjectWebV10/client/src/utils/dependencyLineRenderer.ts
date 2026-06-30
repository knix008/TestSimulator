import type { DependencyItem, GanttViewSettings, TaskItem } from '../types/project';
import { GANTT_HEADER_HEIGHT } from '../config/ganttLayout';

export type LineEndStyle = GanttViewSettings['startLineEnd'];
export type DependencyType = GanttViewSettings['defaultDependencyType'];

const CUSTOM_DEPS_GROUP_CLASS = 'gantt-custom-dependencies';
const LINK_PREVIEW_GROUP_CLASS = 'gantt-link-preview';
const DEPS_CLIP_ID = 'gantt-deps-chart-clip';

export interface Point {
  x: number;
  y: number;
}

export interface BarAnchors {
  left: Point;
  right: Point;
  center: Point;
}

const FS_GAP = 8;
const OTHER_GAP = 12;

function simplifyOrthogonalPath(points: Point[]): Point[] {
  if (points.length <= 2) return points;

  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1];
    const cur = points[i];
    if (prev.x === cur.x && prev.y === cur.y) continue;

    if (out.length >= 2) {
      const before = out[out.length - 2];
      const sameX = before.x === prev.x && prev.x === cur.x;
      const sameY = before.y === prev.y && prev.y === cur.y;
      if (sameX || sameY) {
        out[out.length - 1] = cur;
        continue;
      }
    }
    out.push(cur);
  }
  return out;
}

/** FS: finish-to-start — route around when successor overlaps or sits left of predecessor. */
function buildFSPath(from: BarAnchors, to: BarAnchors, gap = FS_GAP): Point[] {
  const fromX = from.right.x;
  const fromY = from.right.y;
  const toX = to.left.x;
  const toY = to.left.y;

  const pts: Point[] = [from.right, { x: fromX + gap, y: fromY }];

  if (toX > fromX + gap * 2) {
    pts.push({ x: fromX + gap, y: toY }, to.left);
  } else {
    const midY = (fromY + toY) / 2;
    pts.push(
      { x: fromX + gap, y: midY },
      { x: toX - gap, y: midY },
      { x: toX - gap, y: toY },
      to.left,
    );
  }

  return simplifyOrthogonalPath(pts);
}

function buildFFPath(from: BarAnchors, to: BarAnchors, gap = OTHER_GAP): Point[] {
  const rightEdge = Math.max(from.right.x, to.right.x) + gap;
  return simplifyOrthogonalPath([
    from.right,
    { x: rightEdge, y: from.right.y },
    { x: rightEdge, y: to.right.y },
    to.right,
  ]);
}

function buildSSPath(from: BarAnchors, to: BarAnchors, gap = OTHER_GAP): Point[] {
  const leftEdge = Math.min(from.left.x, to.left.x) - gap;
  return simplifyOrthogonalPath([
    from.left,
    { x: leftEdge, y: from.left.y },
    { x: leftEdge, y: to.left.y },
    to.left,
  ]);
}

function buildSFPath(from: BarAnchors, to: BarAnchors, gap = OTHER_GAP): Point[] {
  const routeX = Math.max(from.left.x, to.right.x) + gap;
  return simplifyOrthogonalPath([
    from.left,
    { x: routeX, y: from.left.y },
    { x: routeX, y: to.right.y },
    to.right,
  ]);
}

export interface OrthogonalPathGaps {
  fs?: number;
  other?: number;
}

export function buildOrthogonalPath(
  type: DependencyType,
  from: BarAnchors,
  to: BarAnchors,
  gaps: OrthogonalPathGaps = {},
): Point[] {
  const fsGap = gaps.fs ?? FS_GAP;
  const otherGap = gaps.other ?? OTHER_GAP;
  switch (type) {
    case 'FF':
      return buildFFPath(from, to, otherGap);
    case 'SS':
      return buildSSPath(from, to, otherGap);
    case 'SF':
      return buildSFPath(from, to, otherGap);
    case 'FS':
    default:
      return buildFSPath(from, to, fsGap);
  }
}

export function pointsToPath(points: Point[]): string {
  if (points.length === 0) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

export function buildDependencyPath(
  type: DependencyType,
  from: BarAnchors,
  to: BarAnchors,
  _pathStyle: GanttViewSettings['pathStyle'],
  _curve: number,
): string {
  return pointsToPath(buildOrthogonalPath(type, from, to));
}

function angle(from: Point, to: Point): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

function drawLineEnd(
  parent: SVGGElement,
  from: Point,
  to: Point,
  style: LineEndStyle,
  color: string,
  size: number,
): void {
  if (style === 'None') return;

  const tip = to;
  const a = angle(from, to);

  if (style === 'Dot') {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(tip.x));
    circle.setAttribute('cy', String(tip.y));
    circle.setAttribute('r', String(size / 2.5));
    circle.setAttribute('fill', color);
    parent.appendChild(circle);
    return;
  }

  if (style === 'Square') {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(tip.x - size / 2));
    rect.setAttribute('y', String(tip.y - size / 2));
    rect.setAttribute('width', String(size));
    rect.setAttribute('height', String(size));
    rect.setAttribute('fill', color);
    parent.appendChild(rect);
    return;
  }

  const a1 = a + Math.PI * 0.82;
  const a2 = a - Math.PI * 0.82;
  const p1 = { x: tip.x + size * Math.cos(a1), y: tip.y + size * Math.sin(a1) };
  const p2 = { x: tip.x + size * Math.cos(a2), y: tip.y + size * Math.sin(a2) };

  if (style === 'OpenArrow') {
    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', `${p1.x},${p1.y} ${tip.x},${tip.y} ${p2.x},${p2.y}`);
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', color);
    polyline.setAttribute('stroke-width', '2');
    parent.appendChild(polyline);
    return;
  }

  const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  polygon.setAttribute('points', `${p1.x},${p1.y} ${tip.x},${tip.y} ${p2.x},${p2.y}`);
  polygon.setAttribute('fill', color);
  parent.appendChild(polygon);
}

function strokeDash(style: GanttViewSettings['lineStyle']): string | null {
  switch (style) {
    case 'dash':
      return '8 5';
    case 'dot':
      return '2 4';
    default:
      return null;
  }
}

export function getBarAnchors(container: HTMLElement, taskId: number): BarAnchors | null {
  const wrapper = container.querySelector(`.bar-wrapper[data-id="${taskId}"]`);
  const bar = wrapper?.querySelector('.bar');
  if (!(bar instanceof SVGGraphicsElement)) return null;

  let x: number;
  let y: number;
  let width: number;
  let height: number;
  if (bar instanceof SVGRectElement) {
    x = bar.x.baseVal.value;
    y = bar.y.baseVal.value;
    width = bar.width.baseVal.value;
    height = bar.height.baseVal.value;
  } else {
    const box = bar.getBBox();
    x = box.x;
    y = box.y;
    width = box.width;
    height = box.height;
  }
  if (width <= 0) return null;

  const midY = y + height / 2;
  return {
    left: { x, y: midY },
    right: { x: x + width, y: midY },
    center: { x: x + width / 2, y: midY },
  };
}

function ensureDependencyGroup(svg: SVGSVGElement, hostLayer: SVGGElement): SVGGElement {
  const existing = hostLayer.querySelector(`g.${CUSTOM_DEPS_GROUP_CLASS}`);
  if (existing instanceof SVGGElement) {
    return existing;
  }

  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }

  if (!svg.querySelector(`#${DEPS_CLIP_ID}`)) {
    const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
    clipPath.setAttribute('id', DEPS_CLIP_ID);
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '0');
    rect.setAttribute('y', String(GANTT_HEADER_HEIGHT));
    rect.setAttribute('width', '100000');
    rect.setAttribute('height', '100000');
    clipPath.appendChild(rect);
    defs.appendChild(clipPath);
  }

  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute('class', CUSTOM_DEPS_GROUP_CLASS);
  group.setAttribute('clip-path', `url(#${DEPS_CLIP_ID})`);
  hostLayer.appendChild(group);
  return group;
}

export interface FrappeGanttLayers {
  layers?: { arrow?: SVGGElement; bar?: SVGGElement };
  $svg?: SVGSVGElement;
}

export function isCriticalDependency(
  dep: DependencyItem,
  viewSettings: GanttViewSettings,
  tasks: TaskItem[],
): boolean {
  if (!viewSettings.showCriticalPath) return false;
  const predecessor = tasks.find((task) => task.taskId === dep.predecessorId);
  const successor = tasks.find((task) => task.taskId === dep.successorId);
  return (predecessor?.isCritical ?? false) && (successor?.isCritical ?? false);
}

export function resolveDependencyLineStyle(
  dep: DependencyItem,
  viewSettings: GanttViewSettings,
  tasks: TaskItem[],
): {
  type: DependencyType;
  color: string;
  startLineEnd: LineEndStyle;
  endLineEnd: LineEndStyle;
} {
  const isCritical = isCriticalDependency(dep, viewSettings, tasks);
  return {
    type: (dep.type as DependencyType) || viewSettings.defaultDependencyType,
    color: isCritical ? viewSettings.criticalLineColor : viewSettings.lineColor,
    startLineEnd: (dep.startLineEnd as LineEndStyle) || viewSettings.startLineEnd,
    endLineEnd: (dep.endLineEnd as LineEndStyle) || viewSettings.endLineEnd,
  };
}

export function renderDependencyLines(
  gantt: FrappeGanttLayers,
  container: HTMLElement,
  dependencies: DependencyItem[],
  tasks: TaskItem[],
  viewSettings: GanttViewSettings,
  selectedDependency?: { predecessorId: number; successorId: number } | null,
): void {
  const barLayer = gantt.layers?.bar;
  const svg = gantt.$svg;
  if (!barLayer || !svg) return;

  const target = ensureDependencyGroup(svg, barLayer);
  target.replaceChildren();

  const orderedDependencies = [...dependencies].sort((a, b) => {
    const aCritical = isCriticalDependency(a, viewSettings, tasks);
    const bCritical = isCriticalDependency(b, viewSettings, tasks);
    return Number(aCritical) - Number(bCritical);
  });

  for (const dep of orderedDependencies) {
    const from = getBarAnchors(container, dep.predecessorId);
    const to = getBarAnchors(container, dep.successorId);
    if (!from || !to) continue;

    const style = resolveDependencyLineStyle(dep, viewSettings, tasks);
    const isSelected =
      selectedDependency != null &&
      dep.predecessorId === selectedDependency.predecessorId &&
      dep.successorId === selectedDependency.successorId;
    const pathData = buildDependencyPath(
      style.type,
      from,
      to,
      viewSettings.pathStyle,
      viewSettings.arrowCurve,
    );
    if (!pathData) continue;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', style.color);
    path.setAttribute('stroke-width', isSelected ? '2.75' : '1.75');
    path.setAttribute(
      'class',
      isSelected ? 'gantt-dependency-line gantt-dependency-line-selected' : 'gantt-dependency-line',
    );
    const dash = strokeDash(viewSettings.lineStyle);
    if (dash) path.setAttribute('stroke-dasharray', dash);

    const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hitPath.setAttribute('d', pathData);
    hitPath.setAttribute('fill', 'none');
    hitPath.setAttribute('stroke', 'transparent');
    hitPath.setAttribute('stroke-width', '12');
    hitPath.setAttribute('class', isSelected ? 'gantt-dependency-line-hit gantt-dependency-line-hit-selected' : 'gantt-dependency-line-hit');
    hitPath.setAttribute('data-predecessor-id', String(dep.predecessorId));
    hitPath.setAttribute('data-successor-id', String(dep.successorId));

    target.appendChild(hitPath);
    target.appendChild(path);

    const points = buildOrthogonalPath(style.type, from, to);
    if (points.length >= 2) {
      drawLineEnd(target, points[1], points[0], style.startLineEnd, style.color, 8);
      drawLineEnd(target, points[points.length - 2], points[points.length - 1], style.endLineEnd, style.color, 8);
    }
  }
}

export function clientPointToGanttSvg(svg: SVGSVGElement, clientX: number, clientY: number): Point {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const matrix = svg.getScreenCTM();
  if (!matrix) return { x: 0, y: 0 };
  const local = pt.matrixTransform(matrix.inverse());
  return { x: local.x, y: local.y };
}

function cursorBarAnchors(svg: SVGSVGElement, clientX: number, clientY: number): BarAnchors {
  const cursor = clientPointToGanttSvg(svg, clientX, clientY);
  return {
    left: cursor,
    right: { x: cursor.x + 8, y: cursor.y },
    center: cursor,
  };
}

function ensureLinkPreviewGroup(barLayer: SVGGElement): SVGGElement {
  const existing = barLayer.querySelector(`g.${LINK_PREVIEW_GROUP_CLASS}`);
  if (existing instanceof SVGGElement) return existing;

  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute('class', LINK_PREVIEW_GROUP_CLASS);
  group.setAttribute('pointer-events', 'none');
  barLayer.appendChild(group);
  return group;
}

/** Orthogonal preview while linking tasks (same geometry as finished dependency lines). */
export function renderLinkPreview(
  gantt: FrappeGanttLayers,
  container: HTMLElement,
  fromTaskId: number,
  clientX: number,
  clientY: number,
  viewSettings: GanttViewSettings,
  targetTaskId: number | null = null,
): void {
  const barLayer = gantt.layers?.bar;
  const svg = gantt.$svg;
  if (!barLayer || !svg) return;

  const from = getBarAnchors(container, fromTaskId);
  if (!from) return;

  const to =
    targetTaskId != null ? getBarAnchors(container, targetTaskId) : null;
  const toAnchors = to ?? cursorBarAnchors(svg, clientX, clientY);

  const depType = viewSettings.defaultDependencyType as DependencyType;
  const pathData = buildDependencyPath(
    depType,
    from,
    toAnchors,
    viewSettings.pathStyle,
    viewSettings.arrowCurve,
  );
  if (!pathData) return;

  const group = ensureLinkPreviewGroup(barLayer);
  group.replaceChildren();

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathData);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', '#2563eb');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-dasharray', '6 4');
  path.setAttribute('class', 'gantt-link-preview-path');
  group.appendChild(path);

  const points = buildOrthogonalPath(depType, from, toAnchors);
  if (points.length >= 2) {
    drawLineEnd(group, points[1], points[0], viewSettings.startLineEnd, '#2563eb', 8);
    drawLineEnd(
      group,
      points[points.length - 2],
      points[points.length - 1],
      viewSettings.endLineEnd,
      '#2563eb',
      8,
    );
  }
}

export function clearLinkPreview(gantt: FrappeGanttLayers): void {
  gantt.layers?.bar?.querySelector(`g.${LINK_PREVIEW_GROUP_CLASS}`)?.remove();
}

export function renderDependencyPreview(
  svg: SVGSVGElement,
  viewSettings: GanttViewSettings,
): void {
  svg.replaceChildren();
  svg.setAttribute('viewBox', '0 0 320 80');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '80');

  const from: BarAnchors = {
    left: { x: 40, y: 40 },
    right: { x: 120, y: 40 },
    center: { x: 80, y: 40 },
  };
  const to: BarAnchors = {
    left: { x: 180, y: 40 },
    right: { x: 280, y: 40 },
    center: { x: 230, y: 40 },
  };

  const pathData = buildDependencyPath(
    viewSettings.defaultDependencyType,
    from,
    to,
    viewSettings.pathStyle,
    viewSettings.arrowCurve,
  );

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathData);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', viewSettings.lineColor);
  path.setAttribute('stroke-width', '2');
  const dash = strokeDash(viewSettings.lineStyle);
  if (dash) path.setAttribute('stroke-dasharray', dash);
  svg.appendChild(path);

  const previewGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  svg.appendChild(previewGroup);
  const points = buildOrthogonalPath(viewSettings.defaultDependencyType, from, to);
  if (points.length >= 2) {
    drawLineEnd(previewGroup, points[1], points[0], viewSettings.startLineEnd, viewSettings.lineColor, 9);
    drawLineEnd(previewGroup, points[points.length - 2], points[points.length - 1], viewSettings.endLineEnd, viewSettings.lineColor, 9);
  }

  for (const [x] of [[40], [180]] as const) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', '28');
    rect.setAttribute('width', '80');
    rect.setAttribute('height', '24');
    rect.setAttribute('rx', '4');
    rect.setAttribute('fill', '#93c5fd');
    svg.appendChild(rect);
  }
}
