import fs from 'node:fs/promises';

export const MYPRJ_EXTENSION = 'myprj';
export const MYPRJ_FILTER = {
  name: 'MyProject Project',
  extensions: [MYPRJ_EXTENSION],
};

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
  windowX?: number | null;
  windowY?: number | null;
  windowWidth?: number | null;
  windowHeight?: number | null;
  windowState?: string | null;
  selectedTaskId?: number | null;
  selectedNoteId?: number | null;
  ganttScrollY?: number | null;
  ganttViewStartDate?: string | null;
  taskGridScrollX?: number | null;
  taskGridScrollY?: number | null;
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

export function createEmptyProjectData(): MyProjectFileData {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return {
    version: 1,
    projectName: 'New Project',
    projectStart: today.toISOString(),
    workingDays: [false, true, true, true, true, true, false],
    tasks: [
      {
        id: 1,
        parentId: -1,
        name: 'New Task',
        startDate: today.toISOString(),
        durationDays: 5,
        progress: 0,
        taskType: 'Normal',
        indentLevel: 0,
        isExpanded: true,
        assignedTo: '',
        notes: '',
        autoSchedule: true,
        deliverable: '',
        isCritical: false,
      },
    ],
    dependencies: [],
    assignments: [],
    notes: [],
    settings: null,
  };
}

export async function loadProjectFile(filePath: string): Promise<MyProjectFileData> {
  const raw = await fs.readFile(filePath, 'utf8');
  const json = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const data = JSON.parse(json) as MyProjectFileData;
  if (data.version !== 1) {
    throw new Error(`Unsupported project file version: ${data.version}`);
  }
  return data;
}

export async function saveProjectFile(filePath: string, data: MyProjectFileData): Promise<void> {
  const payload: MyProjectFileData = {
    ...data,
    version: 1,
  };
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
}
