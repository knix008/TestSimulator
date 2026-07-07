import type {
  AssignmentItem,
  DependencyItem,
  GanttViewSettings,
  NoteItem,
  ProjectDetail,
  TaskItem,
} from '@web/types/project';
import { DEFAULT_GANTT_VIEW_SETTINGS, normalizeGanttViewSettings } from '@web/config/ganttViewSettings';
import { computeEndDate, normalizeTasksToWorkingWeek, withRecalculatedSchedule } from '@web/utils/scheduleUtils';
import { serializeWorkingWeek, defaultWorkingWeek } from '@web/utils/workingWeek';
import { normalizeSummaryBarStyle, summaryBarStyleToFileValue } from '@web/utils/summaryBarStyle';

export interface MyProjectTaskData {
  id: number;
  parentId: number;
  name: string;
  startDate: string;
  durationDays: number;
  progress: number;
  taskType: string;
  indentLevel: number;
  isExpanded: boolean;
  assignedTo: string;
  notes: string;
  barColorArgb?: number | null;
  progressColorArgb?: number | null;
  bandColorArgb?: number | null;
  autoSchedule: boolean;
  deliverable: string;
  isCritical: boolean;
  summaryBarStyle?: string | null;
}

export interface MyProjectDependencyData {
  predecessorId: number;
  successorId: number;
  type: string;
  lagDays: number;
  startLineEnd?: string | null;
  endLineEnd?: string | null;
}

export interface MyProjectAssignmentData {
  taskId: number;
  resourceName: string;
  allocationPercent: number;
}

export interface MyProjectNoteData {
  id: number;
  title: string;
  body: string;
  bodyRtf: string;
  taskId: number;
  offsetDays: number;
  anchorDate: string;
  contentY: number;
  contentX: number;
}

export interface MyProjectSettingsData {
  taskGridColumnWidths?: number[] | null;
  defaultDependencyType?: string;
  defaultDependencyStartLineEnd?: string | null;
  defaultDependencyEndLineEnd?: string | null;
  dayWidth?: number;
  splitterDistance?: number;
  propertiesPanelWidth?: number;
  propertiesPanelVisible?: boolean | null;
  useCalendarView?: boolean;
  calendarDisplayUnit?: string | null;
  showCriticalPath?: boolean;
  notesPanelHeight?: number;
  notesPanelVisible?: boolean;
  selectedTaskId?: number | null;
  selectedNoteId?: number | null;
}

export interface MyProjectFileData {
  version: number;
  projectName: string;
  projectStart: string;
  workingDays?: boolean[] | null;
  tasks: MyProjectTaskData[];
  dependencies: MyProjectDependencyData[];
  assignments: MyProjectAssignmentData[];
  notes: MyProjectNoteData[];
  settings?: MyProjectSettingsData | null;
}

export interface DesktopProjectState {
  filePath: string | null;
  project: ProjectDetail;
  ganttViewSettings: GanttViewSettings;
  settings: MyProjectSettingsData | null;
}

function workingDaysToJson(workingDays?: boolean[] | null): string {
  if (Array.isArray(workingDays) && workingDays.length === 7) {
    return serializeWorkingWeek(workingDays);
  }
  return serializeWorkingWeek(defaultWorkingWeek());
}

function taskFromMyprj(task: MyProjectTaskData): TaskItem {
  return {
    taskId: task.id,
    parentId: task.parentId,
    name: task.name,
    startDate: task.startDate,
    durationDays: task.durationDays,
    progress: task.progress,
    taskType: task.taskType,
    indentLevel: task.indentLevel,
    isExpanded: task.isExpanded,
    assignedTo: task.assignedTo,
    notes: task.notes,
    autoSchedule: task.autoSchedule,
    deliverable: task.deliverable,
    isCritical: task.isCritical,
    barColorArgb: task.barColorArgb,
    progressColorArgb: task.progressColorArgb,
    summaryBarStyle: normalizeSummaryBarStyle(task.summaryBarStyle),
    endDate: computeEndDate(task.startDate, task.durationDays, task.taskType),
  };
}

function taskToMyprj(task: TaskItem): MyProjectTaskData {
  return {
    id: task.taskId,
    parentId: task.parentId,
    name: task.name,
    startDate: task.startDate,
    durationDays: task.durationDays,
    progress: task.progress,
    taskType: task.taskType,
    indentLevel: task.indentLevel,
    isExpanded: task.isExpanded,
    assignedTo: task.assignedTo,
    notes: task.notes,
    autoSchedule: task.autoSchedule,
    deliverable: task.deliverable,
    isCritical: task.isCritical,
    barColorArgb: task.barColorArgb,
    progressColorArgb: task.progressColorArgb,
    summaryBarStyle: summaryBarStyleToFileValue(task.summaryBarStyle),
  };
}

function dependencyFromMyprj(dep: MyProjectDependencyData): DependencyItem {
  return {
    predecessorId: dep.predecessorId,
    successorId: dep.successorId,
    type: dep.type,
    lagDays: dep.lagDays,
    startLineEnd: dep.startLineEnd,
    endLineEnd: dep.endLineEnd,
  };
}

function dependencyToMyprj(dep: DependencyItem): MyProjectDependencyData {
  return {
    predecessorId: dep.predecessorId,
    successorId: dep.successorId,
    type: dep.type,
    lagDays: dep.lagDays,
    startLineEnd: dep.startLineEnd,
    endLineEnd: dep.endLineEnd,
  };
}

function noteFromMyprj(note: MyProjectNoteData): NoteItem {
  return {
    noteId: note.id,
    title: note.title,
    body: note.body,
    bodyRtf: note.bodyRtf,
    taskId: note.taskId,
    offsetDays: note.offsetDays,
    anchorDate: note.anchorDate,
    contentY: note.contentY,
    contentX: note.contentX,
  };
}

function noteToMyprj(note: NoteItem): MyProjectNoteData {
  return {
    id: note.noteId,
    title: note.title,
    body: note.body,
    bodyRtf: note.bodyRtf,
    taskId: note.taskId,
    offsetDays: note.offsetDays,
    anchorDate: note.anchorDate,
    contentY: note.contentY,
    contentX: note.contentX,
  };
}

function assignmentFromMyprj(a: MyProjectAssignmentData): AssignmentItem {
  return {
    taskId: a.taskId,
    resourceName: a.resourceName,
    allocationPercent: a.allocationPercent,
  };
}

function assignmentToMyprj(a: AssignmentItem): MyProjectAssignmentData {
  return {
    taskId: a.taskId,
    resourceName: a.resourceName,
    allocationPercent: a.allocationPercent,
  };
}

export function settingsToGanttViewSettings(settings?: MyProjectSettingsData | null): GanttViewSettings {
  if (!settings) return { ...DEFAULT_GANTT_VIEW_SETTINGS };
  const depType = settings.defaultDependencyType;
  const validDep = depType === 'FS' || depType === 'FF' || depType === 'SS' || depType === 'SF'
    ? depType
    : DEFAULT_GANTT_VIEW_SETTINGS.defaultDependencyType;
  return normalizeGanttViewSettings({
    defaultDependencyType: validDep,
    startLineEnd: (settings.defaultDependencyStartLineEnd as GanttViewSettings['startLineEnd']) ?? DEFAULT_GANTT_VIEW_SETTINGS.startLineEnd,
    endLineEnd: (settings.defaultDependencyEndLineEnd as GanttViewSettings['endLineEnd']) ?? DEFAULT_GANTT_VIEW_SETTINGS.endLineEnd,
    showCriticalPath: settings.showCriticalPath ?? false,
  });
}

export function ganttViewSettingsToMyprjSettings(
  current: MyProjectSettingsData | null,
  ganttViewSettings: GanttViewSettings,
): MyProjectSettingsData {
  return {
    ...current,
    defaultDependencyType: ganttViewSettings.defaultDependencyType,
    defaultDependencyStartLineEnd: ganttViewSettings.startLineEnd,
    defaultDependencyEndLineEnd: ganttViewSettings.endLineEnd,
    showCriticalPath: ganttViewSettings.showCriticalPath,
  };
}

export function myprjToDesktopState(data: MyProjectFileData, filePath: string | null): DesktopProjectState {
  const workingDaysJson = workingDaysToJson(data.workingDays);
  let tasks = data.tasks.map(taskFromMyprj);
  tasks = normalizeTasksToWorkingWeek(tasks, workingDaysJson);

  const project: ProjectDetail = {
    id: 1,
    name: data.projectName,
    projectStart: data.projectStart,
    workingDaysJson,
    updatedUtc: new Date().toISOString(),
    version: String(data.version),
    tasks,
    dependencies: data.dependencies.map(dependencyFromMyprj),
    assignments: data.assignments.map(assignmentFromMyprj),
    ganttNotes: data.notes.map(noteFromMyprj),
  };

  const recalculated = withRecalculatedSchedule(project);
  return {
    filePath,
    project: recalculated,
    ganttViewSettings: settingsToGanttViewSettings(data.settings),
    settings: data.settings ?? null,
  };
}

export function desktopStateToMyprj(
  project: ProjectDetail,
  ganttViewSettings: GanttViewSettings,
  settings: MyProjectSettingsData | null,
): MyProjectFileData {
  const workingDays = JSON.parse(project.workingDaysJson) as boolean[];
  return {
    version: 1,
    projectName: project.name,
    projectStart: project.projectStart,
    workingDays,
    tasks: project.tasks.map(taskToMyprj),
    dependencies: project.dependencies.map(dependencyToMyprj),
    assignments: project.assignments.map(assignmentToMyprj),
    notes: project.ganttNotes.map(noteToMyprj),
    settings: ganttViewSettingsToMyprjSettings(settings, ganttViewSettings),
  };
}
