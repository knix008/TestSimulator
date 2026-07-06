export interface ExportProject {
  name: string;
  projectStart: string;
  workingDaysJson: string;
  tasks: Array<{
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
  }>;
  dependencies: Array<{
    predecessorId: number;
    successorId: number;
    type: string;
    lagDays: number;
  }>;
  assignments: Array<{
    taskId: number;
    resourceName: string;
    allocationPercent: number;
  }>;
  ganttNotes: Array<{
    noteId: number;
    title: string;
    body: string;
    bodyRtf: string;
    taskId: number;
    anchorDate: string;
  }>;
}

export type ReportFormat = 'html' | 'markdown' | 'excel' | 'pdf' | 'word' | 'gantt-png';
