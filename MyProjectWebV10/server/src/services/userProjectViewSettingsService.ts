import { prisma } from '../lib/prisma.js';

export type DependencyType = 'FS' | 'FF' | 'SS' | 'SF';
export type LineStyle = 'solid' | 'dash' | 'dot';
export type LineEndStyle = 'None' | 'Arrow' | 'OpenArrow' | 'Dot' | 'Square';
export type PathStyle = 'curved' | 'orthogonal';

export interface GanttViewSettings {
  defaultDependencyType: DependencyType;
  lineColor: string;
  criticalLineColor: string;
  lineStyle: LineStyle;
  startLineEnd: LineEndStyle;
  endLineEnd: LineEndStyle;
  arrowCurve: number;
  pathStyle: PathStyle;
  showCriticalPath: boolean;
}

export const DEFAULT_GANTT_VIEW_SETTINGS: GanttViewSettings = {
  defaultDependencyType: 'FS',
  lineColor: '#788296',
  criticalLineColor: '#d93025',
  lineStyle: 'solid',
  startLineEnd: 'None',
  endLineEnd: 'Arrow',
  arrowCurve: 5,
  pathStyle: 'curved',
  showCriticalPath: false,
};

const dependencyTypes = new Set<DependencyType>(['FS', 'FF', 'SS', 'SF']);
const lineStyles = new Set<LineStyle>(['solid', 'dash', 'dot']);
const lineEndStyles = new Set<LineEndStyle>(['None', 'Arrow', 'OpenArrow', 'Dot', 'Square']);
const pathStyles = new Set<PathStyle>(['curved', 'orthogonal']);

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export function normalizeGanttViewSettings(raw: unknown): GanttViewSettings {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Partial<GanttViewSettings>;
  return {
    defaultDependencyType: dependencyTypes.has(input.defaultDependencyType as DependencyType)
      ? (input.defaultDependencyType as DependencyType)
      : DEFAULT_GANTT_VIEW_SETTINGS.defaultDependencyType,
    lineColor: isHexColor(input.lineColor ?? '')
      ? input.lineColor!
      : DEFAULT_GANTT_VIEW_SETTINGS.lineColor,
    criticalLineColor: isHexColor(input.criticalLineColor ?? '')
      ? input.criticalLineColor!
      : DEFAULT_GANTT_VIEW_SETTINGS.criticalLineColor,
    lineStyle: lineStyles.has(input.lineStyle as LineStyle)
      ? (input.lineStyle as LineStyle)
      : DEFAULT_GANTT_VIEW_SETTINGS.lineStyle,
    startLineEnd: lineEndStyles.has(input.startLineEnd as LineEndStyle)
      ? (input.startLineEnd as LineEndStyle)
      : DEFAULT_GANTT_VIEW_SETTINGS.startLineEnd,
    endLineEnd: lineEndStyles.has(input.endLineEnd as LineEndStyle)
      ? (input.endLineEnd as LineEndStyle)
      : DEFAULT_GANTT_VIEW_SETTINGS.endLineEnd,
    arrowCurve: Number.isFinite(input.arrowCurve)
      ? Math.min(20, Math.max(0, Math.round(input.arrowCurve!)))
      : DEFAULT_GANTT_VIEW_SETTINGS.arrowCurve,
    pathStyle: pathStyles.has(input.pathStyle as PathStyle)
      ? (input.pathStyle as PathStyle)
      : DEFAULT_GANTT_VIEW_SETTINGS.pathStyle,
    showCriticalPath: Boolean(input.showCriticalPath),
  };
}

export async function getUserProjectViewSettings(
  userId: number,
  projectId: number,
): Promise<GanttViewSettings> {
  const row = await prisma.mpUserProjectViewSettings.findUnique({
    where: { userId_projectId: { userId, projectId } },
  });

  if (!row) return { ...DEFAULT_GANTT_VIEW_SETTINGS };

  try {
    return normalizeGanttViewSettings(JSON.parse(row.viewSettingsJson));
  } catch {
    return { ...DEFAULT_GANTT_VIEW_SETTINGS };
  }
}

export async function saveUserProjectViewSettings(
  userId: number,
  projectId: number,
  settings: GanttViewSettings,
): Promise<GanttViewSettings> {
  const normalized = normalizeGanttViewSettings(settings);
  await prisma.mpUserProjectViewSettings.upsert({
    where: { userId_projectId: { userId, projectId } },
    create: {
      userId,
      projectId,
      viewSettingsJson: JSON.stringify(normalized),
    },
    update: {
      viewSettingsJson: JSON.stringify(normalized),
    },
  });
  return normalized;
}
