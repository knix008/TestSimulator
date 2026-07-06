import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell } from 'electron';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import type { ExportProject } from './exportTypes';
import { loadProjectFromPath } from './projectLoader';
import {
  MYPRJ_EXTENSION,
  MYPRJ_FILTER,
  createEmptyProjectData,
  loadProjectFile,
  saveProjectFile,
  type MyProjectFileData,
} from './projectFileService';
import { addRecentFile, clearRecentFiles, readRecentFiles } from './recentFiles';
import { initLocalDatabase, closeLocalDatabase } from './db/localDatabase';
import { registerAuthIpcHandlers } from './auth/authIpc';
import { setLastProjectPath } from './appSettings';
import { getBuildInfo } from './buildInfo';
import {
  defaultExportBasename,
  generateReportBuffer,
  msProjectExtension,
  reportExtension,
  writeMsProjectExport,
  type MsProjectExportFormat,
  type ReportFormat,
} from './reportService';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

const OPEN_FILTERS = [
  {
    name: 'All Supported Projects',
    extensions: ['myprj', 'mpp', 'mpt', 'xml', 'mpx'],
  },
  MYPRJ_FILTER,
  { name: 'Microsoft Project', extensions: ['mpp', 'mpt'] },
  { name: 'Microsoft Project XML', extensions: ['xml'] },
  { name: 'Microsoft Project MPX', extensions: ['mpx'] },
  { name: 'All Files', extensions: ['*'] },
];

let mainWindow: BrowserWindow | null = null;
let currentFilePath: string | null = null;
let isDocumentModified = false;
let pendingOpenFilePath: string | null = null;

/** Keep in sync with @web/utils/toolbarLayout (DESKTOP_WINDOW_MIN_*). */
const WINDOW_MIN_WIDTH = 900;
const WINDOW_MIN_HEIGHT = 600;

function applyWindowMinimumSize(height: number): void {
  if (!mainWindow) return;

  const minWidth = WINDOW_MIN_WIDTH;
  const minHeight = Math.max(WINDOW_MIN_HEIGHT, Math.round(height));
  mainWindow.setMinimumSize(minWidth, minHeight);

  const [currentWidth, currentHeight] = mainWindow.getSize();
  if (currentWidth < minWidth || currentHeight < minHeight) {
    mainWindow.setSize(
      Math.max(currentWidth, minWidth),
      Math.max(currentHeight, minHeight),
    );
  }
}

function getAssetPath(...segments: string[]): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'assets', ...segments);
  }
  return path.join(app.getAppPath(), 'assets', ...segments);
}

function getWindowIcon() {
  const candidates = [
    getAssetPath('icon.ico'),
    getAssetPath('icon.png'),
  ];
  for (const candidate of candidates) {
    if (!fsSync.existsSync(candidate)) continue;
    const image = nativeImage.createFromPath(candidate);
    if (!image.isEmpty()) return image;
  }
  return undefined;
}

function extractMyprjPathFromArgs(args: string[]): string | null {
  const match = args.find((arg) => {
    if (!arg || arg.startsWith('-')) return false;
    return arg.toLowerCase().endsWith(`.${MYPRJ_EXTENSION}`);
  });
  return match ?? null;
}

async function openProjectFromPath(filePath: string): Promise<void> {
  const data = await loadProjectFromPath(filePath);
  setDocumentState(filePath, false);
  await trackRecentFile(filePath);
  await setLastProjectPath(app.getPath('userData'), filePath);
  mainWindow?.webContents.send('project:opened', { data, filePath });
}

function queueProjectOpen(filePath: string): void {
  pendingOpenFilePath = filePath;
  if (mainWindow?.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', () => {
      if (!pendingOpenFilePath) return;
      void openProjectFromPath(pendingOpenFilePath).finally(() => {
        pendingOpenFilePath = null;
      });
    });
    return;
  }
  void openProjectFromPath(filePath).finally(() => {
    pendingOpenFilePath = null;
  });
}

function getTemplatePath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'template', 'Template Project.myprj');
  }
  return path.join(app.getAppPath(), 'template', 'Template Project.myprj');
}

function getRendererUrl(): string {
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    return process.env.VITE_DEV_SERVER_URL;
  }
  return `file://${path.join(__dirname, '../dist-renderer/index.html')}`;
}

function updateWindowTitle(): void {
  if (!mainWindow) return;
  const base = currentFilePath ? path.basename(currentFilePath) : 'Untitled';
  const modified = isDocumentModified ? ' *' : '';
  mainWindow.setTitle(`${base}${modified} - MyProject`);
}

function sendDocumentState(): void {
  mainWindow?.webContents.send('document:state', {
    filePath: currentFilePath,
    isModified: isDocumentModified,
  });
}

function setDocumentState(filePath: string | null, modified: boolean): void {
  currentFilePath = filePath;
  isDocumentModified = modified;
  updateWindowTitle();
  sendDocumentState();
}

async function loadTemplateProject(): Promise<MyProjectFileData> {
  const templatePath = getTemplatePath();
  try {
    return await loadProjectFile(templatePath);
  } catch {
    return createEmptyProjectData();
  }
}

async function trackRecentFile(filePath: string): Promise<string[]> {
  return addRecentFile(app.getPath('userData'), filePath);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    show: false,
    icon: getWindowIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  void mainWindow.loadURL(getRendererUrl());
  if (process.platform !== 'darwin') {
    mainWindow.setMenuBarVisibility(false);
  }
  buildApplicationMenu();
  updateWindowTitle();
}

function buildApplicationMenu(): void {
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        },
      ]),
    );
    return;
  }
  Menu.setApplicationMenu(null);
}

async function saveExportBuffer(
  defaultName: string,
  extension: string,
  buffer: Buffer,
  title: string,
): Promise<string | null> {
  if (!mainWindow) return null;
  const result = await dialog.showSaveDialog(mainWindow, {
    title,
    defaultPath: `${defaultName}.${extension}`,
    filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
  });
  if (result.canceled || !result.filePath) return null;
  let filePath = result.filePath;
  if (!filePath.toLowerCase().endsWith(`.${extension}`)) {
    filePath += `.${extension}`;
  }
  await fs.writeFile(filePath, buffer);
  return filePath;
}

function registerIpcHandlers(): void {
  registerAuthIpcHandlers(() => app.getPath('userData'));

  ipcMain.handle('window:set-minimum-size', (_event, _width: number, height: number) => {
    if (!Number.isFinite(height)) return;
    applyWindowMinimumSize(height);
  });

  ipcMain.handle('project:new', async () => {
    const data = await loadTemplateProject();
    setDocumentState(null, false);
    await setLastProjectPath(app.getPath('userData'), null);
    return { data, filePath: null };
  });

  ipcMain.handle('project:open-dialog', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open Project',
      filters: OPEN_FILTERS,
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const data = await loadProjectFromPath(filePath);
    setDocumentState(filePath, false);
    await trackRecentFile(filePath);
    await setLastProjectPath(app.getPath('userData'), filePath);
    return { data, filePath };
  });

  ipcMain.handle('project:open-path', async (_event, filePath: string) => {
    const data = await loadProjectFromPath(filePath);
    setDocumentState(filePath, false);
    await trackRecentFile(filePath);
    await setLastProjectPath(app.getPath('userData'), filePath);
    return { data, filePath };
  });

  ipcMain.handle('project:save', async (_event, data: MyProjectFileData) => {
    if (!currentFilePath) {
      if (!mainWindow) return null;
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Project',
        filters: [MYPRJ_FILTER],
        defaultPath: data.projectName.replace(/[^\w\s-]/g, '') + `.${MYPRJ_EXTENSION}`,
      });
      if (result.canceled || !result.filePath) return null;
      let filePath = result.filePath;
      if (!filePath.toLowerCase().endsWith(`.${MYPRJ_EXTENSION}`)) {
        filePath += `.${MYPRJ_EXTENSION}`;
      }
      await saveProjectFile(filePath, data);
      setDocumentState(filePath, false);
      await trackRecentFile(filePath);
      await setLastProjectPath(app.getPath('userData'), filePath);
      return { filePath };
    }
    await saveProjectFile(currentFilePath, data);
    setDocumentState(currentFilePath, false);
    await trackRecentFile(currentFilePath);
    await setLastProjectPath(app.getPath('userData'), currentFilePath);
    return { filePath: currentFilePath };
  });

  ipcMain.handle('project:save-as', async (_event, data: MyProjectFileData) => {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Project',
      filters: [MYPRJ_FILTER],
      defaultPath: data.projectName.replace(/[^\w\s-]/g, '') + `.${MYPRJ_EXTENSION}`,
    });
    if (result.canceled || !result.filePath) return null;
    let filePath = result.filePath;
    if (!filePath.toLowerCase().endsWith(`.${MYPRJ_EXTENSION}`)) {
      filePath += `.${MYPRJ_EXTENSION}`;
    }
    await saveProjectFile(filePath, data);
    setDocumentState(filePath, false);
    await trackRecentFile(filePath);
    await setLastProjectPath(app.getPath('userData'), filePath);
    return { filePath };
  });

  ipcMain.on('project:set-modified', (_event, modified: boolean) => {
    isDocumentModified = modified;
    updateWindowTitle();
    sendDocumentState();
  });

  ipcMain.handle('recent:list', async () => readRecentFiles(app.getPath('userData')));

  ipcMain.handle('recent:clear', async () => {
    await clearRecentFiles(app.getPath('userData'));
    return [];
  });

  ipcMain.handle(
    'export:report',
    async (_event, format: ReportFormat, project: ExportProject, ganttPngBase64?: string) => {
      const ext = reportExtension(format);
      const buffer = await generateReportBuffer(format, project, ganttPngBase64);
      return saveExportBuffer(defaultExportBasename(project), ext, buffer, 'Export Report');
    },
  );

  ipcMain.handle('export:ms-project', async (_event, project: ExportProject) => {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export to Microsoft Project',
      defaultPath: `${defaultExportBasename(project)}.xml`,
      filters: [
        { name: 'Microsoft Project XML', extensions: ['xml'] },
        { name: 'Microsoft Project MPX', extensions: ['mpx'] },
      ],
    });
    if (result.canceled || !result.filePath) return null;
    let filePath = result.filePath;
    const format: MsProjectExportFormat = filePath.toLowerCase().endsWith('.mpx') ? 'mpx' : 'xml';
    const ext = msProjectExtension(format);
    if (!filePath.toLowerCase().endsWith(`.${ext}`)) {
      filePath += `.${ext}`;
    }
    await writeMsProjectExport(filePath, format, project);
    return { filePath };
  });

  ipcMain.handle('export:save-image', async (_event, defaultName: string, dataUrl: string) => {
    const buffer = await generateReportBuffer('gantt-png', {
      name: defaultName,
      projectStart: new Date().toISOString(),
      workingDaysJson: '[]',
      tasks: [],
      dependencies: [],
      assignments: [],
      ganttNotes: [],
    }, dataUrl);
    return saveExportBuffer(defaultName, 'png', buffer, 'Export Gantt Image');
  });

  ipcMain.handle('app:print', async () => {
    if (!mainWindow) return false;
    return new Promise<boolean>((resolve) => {
      mainWindow!.webContents.print({ silent: false, printBackground: true }, (success) => {
        resolve(success);
      });
    });
  });

  ipcMain.handle('shell:show-item-in-folder', async (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle('app:get-user-data-path', () => app.getPath('userData'));

  ipcMain.handle('settings:read', async () => {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    try {
      const raw = await fs.readFile(settingsPath, 'utf8');
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  });

  ipcMain.handle('settings:write', async (_event, settings: Record<string, unknown>) => {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  });

  ipcMain.on('app:quit', () => {
    app.quit();
  });

  ipcMain.handle('app:getInfo', () => {
    const build = getBuildInfo();
    return {
      version: build.version,
      productName: 'MyProject',
      build,
    };
  });
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.myproject.desktop');
  }

  const build = getBuildInfo();
  if (process.platform === 'darwin') {
    app.setAboutPanelOptions({
      applicationName: 'MyProject',
      applicationVersion: build.version,
      version: build.development
        ? 'Development'
        : build.commit
          ? `${build.commit}${build.branch ? ` (${build.branch})` : ''}`
          : build.buildDate ?? '',
      copyright: `Copyright © ${new Date().getFullYear()} MyProject`,
    });
  }

  try {
    initLocalDatabase(app.getPath('userData'));
  } catch (error) {
    console.error('Failed to initialize local user database:', error);
  }

  registerIpcHandlers();
  createWindow();

  const initialProjectPath = extractMyprjPathFromArgs(process.argv.slice(1));
  if (initialProjectPath) {
    queueProjectOpen(path.resolve(initialProjectPath));
  }

  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (filePath.toLowerCase().endsWith(`.${MYPRJ_EXTENSION}`)) {
      queueProjectOpen(path.resolve(filePath));
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    const projectPath = extractMyprjPathFromArgs(argv.slice(1));
    if (projectPath) {
      queueProjectOpen(path.resolve(projectPath));
    }
  });
}

app.on('window-all-closed', () => {
  closeLocalDatabase();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
