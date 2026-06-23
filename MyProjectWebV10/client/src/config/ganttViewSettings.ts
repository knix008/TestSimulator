import type { GanttViewSettings } from '../types/project';

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

export const DEPENDENCY_TYPE_OPTIONS = [
  { value: 'FS', label: 'FS (완료-시작)' },
  { value: 'FF', label: 'FF (완료-완료)' },
  { value: 'SS', label: 'SS (시작-시작)' },
  { value: 'SF', label: 'SF (시작-완료)' },
] as const;

export const LINE_STYLE_OPTIONS = [
  { value: 'solid', label: '실선' },
  { value: 'dash', label: '파선' },
  { value: 'dot', label: '점선' },
] as const;

export const LINE_END_OPTIONS = [
  { value: 'None', label: '없음' },
  { value: 'Arrow', label: '화살표 (채움)' },
  { value: 'OpenArrow', label: '화살표 (빈)' },
  { value: 'Dot', label: '원' },
  { value: 'Square', label: '사각형' },
] as const;

export const PATH_STYLE_OPTIONS = [
  { value: 'curved', label: '곡선' },
  { value: 'orthogonal', label: '직각' },
] as const;

export function normalizeGanttViewSettings(input: Partial<GanttViewSettings> | null): GanttViewSettings {
  if (!input) return { ...DEFAULT_GANTT_VIEW_SETTINGS };
  return {
    defaultDependencyType: input.defaultDependencyType ?? DEFAULT_GANTT_VIEW_SETTINGS.defaultDependencyType,
    lineColor: /^#[0-9a-fA-F]{6}$/.test(input.lineColor ?? '') ? input.lineColor! : DEFAULT_GANTT_VIEW_SETTINGS.lineColor,
    criticalLineColor: /^#[0-9a-fA-F]{6}$/.test(input.criticalLineColor ?? '')
      ? input.criticalLineColor!
      : DEFAULT_GANTT_VIEW_SETTINGS.criticalLineColor,
    lineStyle: input.lineStyle ?? DEFAULT_GANTT_VIEW_SETTINGS.lineStyle,
    startLineEnd: input.startLineEnd ?? DEFAULT_GANTT_VIEW_SETTINGS.startLineEnd,
    endLineEnd: input.endLineEnd ?? DEFAULT_GANTT_VIEW_SETTINGS.endLineEnd,
    arrowCurve: Number.isFinite(input.arrowCurve)
      ? Math.min(20, Math.max(0, Math.round(input.arrowCurve!)))
      : DEFAULT_GANTT_VIEW_SETTINGS.arrowCurve,
    pathStyle: input.pathStyle ?? DEFAULT_GANTT_VIEW_SETTINGS.pathStyle,
    showCriticalPath: Boolean(input.showCriticalPath),
  };
}
