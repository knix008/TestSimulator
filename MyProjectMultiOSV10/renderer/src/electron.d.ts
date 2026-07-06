export interface DocumentState {
  filePath: string | null;
  isModified: boolean;
}

export interface MyProjectFileData {
  version: number;
  projectName: string;
  projectStart: string;
  workingDays?: boolean[] | null;
  tasks: unknown[];
  dependencies: unknown[];
  assignments: unknown[];
  notes: unknown[];
  settings?: Record<string, unknown> | null;
}

export interface ProjectLoadResult {
  data: MyProjectFileData;
  filePath: string | null;
}

export interface ProjectSaveResult {
  filePath: string;
}

export interface ExportResult {
  filePath: string;
}

export type ReportFormat = 'html' | 'markdown' | 'excel' | 'pdf' | 'word' | 'gantt-png';

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

export interface ElectronApi {
  newProject: () => Promise<ProjectLoadResult>;
  openProjectDialog: () => Promise<ProjectLoadResult | null>;
  openProjectPath: (filePath: string) => Promise<ProjectLoadResult>;
  saveProject: (data: MyProjectFileData) => Promise<ProjectSaveResult | null>;
  saveProjectAs: (data: MyProjectFileData) => Promise<ProjectSaveResult | null>;
  setModified: (modified: boolean) => void;
  readSettings: () => Promise<Record<string, unknown>>;
  writeSettings: (settings: Record<string, unknown>) => Promise<void>;
  listRecentFiles: () => Promise<string[]>;
  clearRecentFiles: () => Promise<string[]>;
  exportReport: (format: ReportFormat, project: ExportProject, ganttPngBase64?: string) => Promise<string | null>;
  exportMsProject: (project: ExportProject) => Promise<ExportResult | null>;
  saveGanttImage: (defaultName: string, dataUrl: string) => Promise<string | null>;
  printProject: () => Promise<boolean>;
  onMenuNewProject: (callback: () => void) => () => void;
  onMenuOpenFile: (callback: (filePath: string) => void) => () => void;
  onMenuSave: (callback: () => void) => () => void;
  onMenuSaveAs: (callback: () => void) => () => void;
  onDocumentState: (callback: (state: DocumentState) => void) => () => void;
  onProjectOpened: (callback: (result: ProjectLoadResult) => void) => () => void;
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  quitApp: () => void;
  showAbout: () => Promise<void>;
}

declare global {
  interface Window {
    electronAPI: ElectronApi;
  }
}

export {};
