import { contextBridge, ipcRenderer } from 'electron';
import type { ExportProject } from './exportTypes';
import type { MyProjectFileData } from './projectFileService';
import type { MsProjectExportFormat, ReportFormat } from './reportService';

export interface DocumentState {
  filePath: string | null;
  isModified: boolean;
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

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const electronApi: ElectronApi = {
  newProject: () => ipcRenderer.invoke('project:new'),
  openProjectDialog: () => ipcRenderer.invoke('project:open-dialog'),
  openProjectPath: (filePath) => ipcRenderer.invoke('project:open-path', filePath),
  saveProject: (data) => ipcRenderer.invoke('project:save', data),
  saveProjectAs: (data) => ipcRenderer.invoke('project:save-as', data),
  setModified: (modified) => ipcRenderer.send('project:set-modified', modified),
  readSettings: () => ipcRenderer.invoke('settings:read'),
  writeSettings: (settings) => ipcRenderer.invoke('settings:write', settings),
  listRecentFiles: () => ipcRenderer.invoke('recent:list'),
  clearRecentFiles: () => ipcRenderer.invoke('recent:clear'),
  exportReport: (format, project, ganttPngBase64) =>
    ipcRenderer.invoke('export:report', format, project, ganttPngBase64),
  exportMsProject: (project) => ipcRenderer.invoke('export:ms-project', project),
  saveGanttImage: (defaultName, dataUrl) => ipcRenderer.invoke('export:save-image', defaultName, dataUrl),
  printProject: () => ipcRenderer.invoke('app:print'),
  onMenuNewProject: (callback) => subscribe('menu:new-project', callback),
  onMenuOpenFile: (callback) => subscribe('menu:open-file', callback),
  onMenuSave: (callback) => subscribe('menu:save', callback),
  onMenuSaveAs: (callback) => subscribe('menu:save-as', callback),
  onDocumentState: (callback) => subscribe('document:state', callback),
  onProjectOpened: (callback) => subscribe<ProjectLoadResult>('project:opened', callback),
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  quitApp: () => ipcRenderer.send('app:quit'),
  showAbout: () => ipcRenderer.invoke('app:about'),
};

contextBridge.exposeInMainWorld('electronAPI', electronApi);

export type { ReportFormat, MsProjectExportFormat, ExportProject };
