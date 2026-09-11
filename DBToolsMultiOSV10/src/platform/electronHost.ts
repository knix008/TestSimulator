// Electron host: everything goes through the preload bridge (contextIsolation on).
import type {
  AppSettingsData,
  Host,
  OpenRequest,
  OpenedFile,
  SaveRequest,
} from './host';
import { toBytes } from './host';

export interface ElectronBridge {
  openFile(filters: { name: string; extensions: string[] }[]): Promise<{
    path: string;
    name: string;
    bytes: ArrayBuffer;
  } | null>;
  saveFile(
    suggestedName: string,
    filters: { name: string; extensions: string[] }[],
    data: ArrayBuffer,
  ): Promise<string | null>;
  writeFile(path: string, data: ArrayBuffer): Promise<string | null>;
  readFileByPath(path: string): Promise<{ path: string; name: string; bytes: ArrayBuffer } | null>;
  readSettings(): Promise<Partial<AppSettingsData> | null>;
  writeSettings(settings: AppSettingsData): Promise<void>;
  readRecentFiles(): Promise<string[]>;
  writeRecentFiles(files: string[]): Promise<void>;
  chooseDirectory(defaultPath?: string): Promise<string | null>;
  writeFilesToDirectory(
    directory: string,
    files: { name: string; data: ArrayBuffer }[],
  ): Promise<number>;
  getStartupFile(): Promise<string | null>;
  getTemplateDirectory(): Promise<string>;
  printToPdf(html: string, suggestedName: string): Promise<string | null>;
  setTitle(title: string): void;
  setMinimumWidth(width: number): void;
  setDirty(dirty: boolean): void;
  onCloseRequested(handler: () => void): void;
  confirmClose(): void;
  onOpenFile(handler: (path: string) => void): void;
}

declare global {
  interface Window {
    dbtools?: ElectronBridge;
  }
}

function asArrayBuffer(data: Uint8Array | string): ArrayBuffer {
  const bytes = toBytes(data);
  // Always hand a standalone ArrayBuffer to IPC (WASM views are not transferable).
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export class ElectronHost implements Host {
  readonly kind = 'electron' as const;

  constructor(private readonly bridge: ElectronBridge) {}

  async openFile(request: OpenRequest): Promise<OpenedFile | null> {
    const result = await this.bridge.openFile(request.filters);
    return result ? { path: result.path, name: result.name, bytes: new Uint8Array(result.bytes) } : null;
  }

  saveFile(request: SaveRequest): Promise<string | null> {
    return this.bridge.saveFile(request.suggestedName, request.filters, asArrayBuffer(request.data));
  }

  writeFile(path: string, data: Uint8Array | string): Promise<string | null> {
    return this.bridge.writeFile(path, asArrayBuffer(data));
  }

  async readFileByPath(path: string): Promise<OpenedFile | null> {
    const result = await this.bridge.readFileByPath(path);
    return result ? { path: result.path, name: result.name, bytes: new Uint8Array(result.bytes) } : null;
  }

  readSettings(): Promise<Partial<AppSettingsData> | null> {
    return this.bridge.readSettings();
  }

  writeSettings(settings: AppSettingsData): Promise<void> {
    return this.bridge.writeSettings(settings);
  }

  readRecentFiles(): Promise<string[]> {
    return this.bridge.readRecentFiles();
  }

  writeRecentFiles(files: string[]): Promise<void> {
    return this.bridge.writeRecentFiles(files);
  }

  async chooseDirectory(): Promise<string | null> {
    const templateDir = await this.bridge.getTemplateDirectory();
    return this.bridge.chooseDirectory(templateDir);
  }

  writeFilesToDirectory(
    directory: string,
    files: { name: string; data: Uint8Array | string }[],
  ): Promise<number> {
    return this.bridge.writeFilesToDirectory(
      directory,
      files.map((f) => ({ name: f.name, data: asArrayBuffer(f.data) })),
    );
  }

  getStartupFile(): Promise<string | null> {
    return this.bridge.getStartupFile();
  }

  printToPdf(html: string, suggestedName: string): Promise<string | null> {
    return this.bridge.printToPdf(html, suggestedName);
  }

  setTitle(title: string): void {
    this.bridge.setTitle(title);
  }

  setMinimumWidth(width: number): void {
    this.bridge.setMinimumWidth(width);
  }

  onBeforeClose(handler: () => Promise<boolean>): void {
    this.bridge.onCloseRequested(async () => {
      if (await handler()) this.bridge.confirmClose();
    });
  }

  setDirty(dirty: boolean): void {
    this.bridge.setDirty(dirty);
  }

  onOpenFile(handler: (path: string) => void): void {
    this.bridge.onOpenFile(handler);
  }
}
