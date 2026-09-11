import { contextBridge, ipcRenderer } from 'electron';

type Filter = { name: string; extensions: string[] };

contextBridge.exposeInMainWorld('dbtools', {
  openFile: (filters: Filter[]) => ipcRenderer.invoke('file:open', filters),
  saveFile: (suggestedName: string, filters: Filter[], data: ArrayBuffer) =>
    ipcRenderer.invoke('file:save', suggestedName, filters, data),
  writeFile: (path: string, data: ArrayBuffer) => ipcRenderer.invoke('file:write', path, data),
  readFileByPath: (path: string) => ipcRenderer.invoke('file:read', path),

  readSettings: () => ipcRenderer.invoke('settings:read'),
  writeSettings: (settings: unknown) => ipcRenderer.invoke('settings:write', settings),
  readRecentFiles: () => ipcRenderer.invoke('recent:read'),
  writeRecentFiles: (files: string[]) => ipcRenderer.invoke('recent:write', files),

  chooseDirectory: (defaultPath?: string) => ipcRenderer.invoke('dir:choose', defaultPath),
  writeFilesToDirectory: (directory: string, files: { name: string; data: ArrayBuffer }[]) =>
    ipcRenderer.invoke('dir:writeFiles', directory, files),

  getStartupFile: () => ipcRenderer.invoke('app:startupFile'),
  getTemplateDirectory: () => ipcRenderer.invoke('app:templateDir'),
  printToPdf: (html: string, suggestedName: string) =>
    ipcRenderer.invoke('export:pdf', html, suggestedName),

  setTitle: (title: string) => ipcRenderer.send('app:setTitle', title),
  setMinimumWidth: (width: number) => ipcRenderer.send('app:setMinimumWidth', width),
  setDirty: (dirty: boolean) => ipcRenderer.send('app:setDirty', dirty),
  confirmClose: () => ipcRenderer.send('app:confirmClose'),
  onCloseRequested: (handler: () => void) => {
    ipcRenderer.on('app:close-requested', () => handler());
  },
  onOpenFile: (handler: (path: string) => void) => {
    ipcRenderer.on('app:open-file', (_e, path: string) => handler(path));
  },
});
