/** Project snapshot used for report/export (matches Web server ProjectDetailDto). */
export interface ExportTask {
  taskId: number;
  parentId: number;
  name: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  progress: number;
  taskType: string;
  indentLevel: number;
  isExpanded: boolean;
  assignedTo: string;
  notes: string;
  autoSchedule: boolean;
  deliverable: string;
  isCritical: boolean;
  barColorArgb?: number | null;
  progressColorArgb?: number | null;
}

export interface ExportDependency {
  predecessorId: number;
  successorId: number;
  type: string;
  lagDays: number;
}

export interface ExportAssignment {
  taskId: number;
  resourceName: string;
  allocationPercent: number;
}

export interface ExportNote {
  noteId: number;
  title: string;
  body: string;
  bodyRtf: string;
  taskId: number;
  anchorDate: string;
}

export interface ExportProject {
  name: string;
  projectStart: string;
  workingDaysJson: string;
  tasks: ExportTask[];
  dependencies: ExportDependency[];
  assignments: ExportAssignment[];
  ganttNotes: ExportNote[];
}
