// Platform abstraction: the same UI runs on Electron (native dialogs + fs) and
// in a browser (File System Access API, with a download/upload fallback).

export interface OpenedFile {
  /** Full path on Electron; bare file name in the browser. */
  path: string;
  name: string;
  bytes: Uint8Array;
}

export interface SaveRequest {
  suggestedName: string;
  /** e.g. [{ name: 'SQL', extensions: ['sql'] }] */
  filters: { name: string; extensions: string[] }[];
  data: Uint8Array | string;
}

export interface OpenRequest {
  filters: { name: string; extensions: string[] }[];
}

/**
 * Chromium's own print header and footer. Only these carry a real page number
 * (`.pageNumber` / `.totalPages` spans), which is why they are passed alongside
 * the document rather than baked into it.
 */
export interface PdfPrintOptions {
  headerTemplate?: string;
  footerTemplate?: string;
}

export interface AppSettingsData {
  Language: 'ko' | 'en';
  Theme: string;
  DefaultDbType: string;
  DefaultLineStyle: string;
  RecentFilesMaxCount: number;
  ShowGrid: boolean;
  SnapToGrid: boolean;
  SnapInterval: number;
  NormalizationLevels: string;
  RightPanelWidth?: number;
  ImageExportTransparent?: boolean;
  LastOpenDirectory?: string;
  /** Report layout settings, stored as a nested block (see ReportPrefs). */
  Report?: Record<string, unknown>;
}

export interface Host {
  readonly kind: 'electron' | 'web';
  openFile(request: OpenRequest): Promise<OpenedFile | null>;
  /** Returns the saved path (Electron) or file name (browser), or null if cancelled. */
  saveFile(request: SaveRequest): Promise<string | null>;
  /** Overwrite a known path without a dialog. Browser hosts fall back to saveFile. */
  writeFile(path: string, data: Uint8Array | string): Promise<string | null>;
  readSettings(): Promise<Partial<AppSettingsData> | null>;
  writeSettings(settings: AppSettingsData): Promise<void>;
  readRecentFiles(): Promise<string[]>;
  writeRecentFiles(files: string[]): Promise<void>;
  /** Directory for generated sample files, or null when the host has no filesystem. */
  chooseDirectory(): Promise<string | null>;
  writeFilesToDirectory(directory: string, files: { name: string; data: Uint8Array | string }[]): Promise<number>;
  /** File passed on the command line / opened via file association. */
  getStartupFile(): Promise<string | null>;
  /** Read a file by absolute path (Electron only). */
  readFileByPath(path: string): Promise<OpenedFile | null>;
  printToPdf(html: string, suggestedName: string, options?: PdfPrintOptions): Promise<string | null>;
  setTitle(title: string): void;
  /**
   * Set the window's outer size, for the corner resize grip. Absolute rather
   * than a delta: sizing a window from deltas feeds back on itself.
   */
  resizeWindowTo(width: number, height: number): void;
  onBeforeClose(handler: () => Promise<boolean>): void;
}

export function toBytes(data: Uint8Array | string): Uint8Array {
  return typeof data === 'string' ? new TextEncoder().encode(data) : data;
}

export function baseName(path: string): string {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return slash < 0 ? path : path.substring(slash + 1);
}

export function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? name : name.substring(0, dot);
}
