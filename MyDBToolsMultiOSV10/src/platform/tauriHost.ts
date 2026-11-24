// Tauri host: native dialogs and file I/O through the Rust shell (src-tauri).
//
// Bytes cross the bridge as base64 strings: a Uint8Array would be serialized as a
// JSON array of numbers, several times larger and slow to parse for a database.
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type {
  AppSettingsData,
  Host,
  OpenRequest,
  OpenedFile,
  PdfPrintOptions,
  SaveRequest,
} from './host';
import { toBytes } from './host';

export function isTauriShell(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

interface RawOpened {
  path: string;
  name: string;
  data: string;
}

const toOpened = (raw: RawOpened | null): OpenedFile | null =>
  raw ? { path: raw.path, name: raw.name, bytes: base64ToBytes(raw.data) } : null;

/** Tauri's listen is asynchronous; the callers' unsubscribe functions are not. */
function subscribe<T>(event: string, callback: (payload: T) => void): () => void {
  let stop: (() => void) | null = null;
  let stopped = false;
  void listen<T>(event, (message) => callback(message.payload), {
    target: { kind: 'WebviewWindow', label: getCurrentWindow().label },
  }).then((off) => {
    if (stopped) off();
    else stop = off;
  });
  return () => {
    stopped = true;
    stop?.();
  };
}

export class TauriHost implements Host {
  readonly kind = 'desktop' as const;

  async openFile(request: OpenRequest): Promise<OpenedFile | null> {
    return toOpened(await invoke<RawOpened | null>('files_open', { filters: request.filters }));
  }

  saveFile(request: SaveRequest): Promise<string | null> {
    return invoke<string | null>('files_save', {
      name: request.suggestedName,
      filters: request.filters,
      data: bytesToBase64(toBytes(request.data)),
    });
  }

  writeFile(path: string, data: Uint8Array | string): Promise<string | null> {
    return invoke<string>('files_write', { path, data: bytesToBase64(toBytes(data)) });
  }

  async readFileByPath(path: string): Promise<OpenedFile | null> {
    return toOpened(await invoke<RawOpened | null>('files_read', { path }));
  }

  readSettings(): Promise<Partial<AppSettingsData> | null> {
    return invoke<Partial<AppSettingsData> | null>('settings_read');
  }

  writeSettings(settings: AppSettingsData): Promise<void> {
    // Shared with the document windows (user guide), which read the theme from here.
    try {
      localStorage.setItem('dbtools.settings', JSON.stringify(settings));
    } catch {
      /* storage blocked: only the settings file keeps it */
    }
    return invoke('settings_write', { settings });
  }

  readRecentFiles(): Promise<string[]> {
    return invoke<string[]>('recent_read');
  }

  writeRecentFiles(files: string[]): Promise<void> {
    return invoke('recent_write', { files });
  }

  async chooseDirectory(): Promise<string | null> {
    const templateDir = await invoke<string>('template_dir');
    return invoke<string | null>('dir_choose', { defaultPath: templateDir });
  }

  writeFilesToDirectory(directory: string, files: { name: string; data: Uint8Array | string }[]): Promise<number> {
    return invoke<number>('dir_write_files', {
      directory,
      files: files.map((f) => ({ name: f.name, data: bytesToBase64(toBytes(f.data)) })),
    });
  }

  getStartupFile(): Promise<string | null> {
    return invoke<string | null>('startup_file');
  }

  /**
   * WebView2's PrintToPdf: the document lays itself out, with the page margin
   * given to the print settings. Chromium's header and footer templates have no
   * WebView2 equivalent; when the report asks for running headers or page numbers,
   * WebView2's own header and footer (title, date, page n/total) are turned on.
   */
  async printToPdf(html: string, suggestedName: string, options?: PdfPrintOptions): Promise<string | null> {
    const output = await invoke<string | null>('files_pick_save', {
      name: suggestedName,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (!output) return null;
    const running = Boolean(options?.headerTemplate || options?.footerTemplate);
    const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? suggestedName;
    await invoke('print_pdf', {
      job: { html, widthMm: 210, heightMm: 297, marginMm: 12.7, output, headerTitle: running ? title : null },
    });
    return output;
  }

  setTitle(title: string): void {
    void invoke('set_title', { title });
  }

  resizeWindowTo(): void {
    // The main window's grip starts a native resize drag instead (ResizeGrip).
  }

  setMinimumWidth(width: number): void {
    void invoke('set_min_width', { width });
  }

  onBeforeClose(handler: () => Promise<boolean>): void {
    subscribe('window:close-request', async () => {
      if (await handler()) await invoke('window_force_close');
    });
  }

  onOpenFile(handler: (path: string) => void): void {
    subscribe<string>('app:open-file', handler);
  }

  /** The page has painted: the hidden window can appear. */
  ready(): void {
    void invoke('window_ready');
  }

  openDoc(doc: 'guide' | 'tutorial', language: string): Promise<void> {
    return invoke('open_doc', { doc, language });
  }

  minimize(): void {
    void getCurrentWindow().minimize();
  }

  toggleMaximize(): void {
    void getCurrentWindow().toggleMaximize();
  }

  close(): void {
    void getCurrentWindow().close();
  }

  startResize(): void {
    void getCurrentWindow().startResizeDragging('SouthEast');
  }

  onPopoutClosed(handler: (label: string) => void): () => void {
    return subscribe<string>('popout-closed', handler);
  }
}
