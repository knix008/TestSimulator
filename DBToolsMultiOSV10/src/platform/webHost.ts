// Browser host: File System Access API where available, download/upload otherwise.
// Settings and the recent-file list live in localStorage.
import {
  baseName,
  toBytes,
  type AppSettingsData,
  type Host,
  type OpenRequest,
  type OpenedFile,
  type SaveRequest,
} from './host';

const SETTINGS_KEY = 'dbtools.settings';
const RECENT_KEY = 'dbtools.recent';

interface FsPickerType {
  description: string;
  accept: Record<string, string[]>;
}

declare global {
  interface Window {
    showOpenFilePicker?: (options: unknown) => Promise<FileSystemFileHandle[]>;
    showSaveFilePicker?: (options: unknown) => Promise<FileSystemFileHandle>;
  }
}

function toPickerTypes(filters: { name: string; extensions: string[] }[]): FsPickerType[] {
  return filters
    .filter((f) => !f.extensions.includes('*'))
    .map((f) => ({
      description: f.name,
      accept: { 'application/octet-stream': f.extensions.map((e) => '.' + e) },
    }));
}

function toAcceptAttribute(filters: { name: string; extensions: string[] }[]): string {
  const exts = filters.flatMap((f) => f.extensions).filter((e) => e !== '*');
  return exts.length ? exts.map((e) => '.' + e).join(',') : '';
}

function download(name: string, data: Uint8Array | string): void {
  const bytes = toBytes(data);
  // Copy into a fresh buffer so Blob never sees a detached WASM view.
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function pickWithInput(accept: string): Promise<OpenedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    let settled = false;
    const finish = (value: OpenedFile | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return finish(null);
      const bytes = new Uint8Array(await file.arrayBuffer());
      finish({ path: file.name, name: file.name, bytes });
    });
    // Fires when the picker is dismissed on browsers that support it.
    input.addEventListener('cancel', () => finish(null));
    input.click();
  });
}

export class WebHost implements Host {
  readonly kind = 'web' as const;
  /** Handles kept per saved path so "Save" can overwrite without re-prompting. */
  private handles = new Map<string, FileSystemFileHandle>();

  async openFile(request: OpenRequest): Promise<OpenedFile | null> {
    if (window.showOpenFilePicker) {
      try {
        const types = toPickerTypes(request.filters);
        const [handle] = await window.showOpenFilePicker({
          types,
          excludeAcceptAllOption: false,
          multiple: false,
        });
        const file = await handle.getFile();
        const bytes = new Uint8Array(await file.arrayBuffer());
        this.handles.set(file.name, handle);
        return { path: file.name, name: file.name, bytes };
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return null;
        // Fall through to the input fallback (e.g. cross-origin isolation issues).
      }
    }
    return pickWithInput(toAcceptAttribute(request.filters));
  }

  async saveFile(request: SaveRequest): Promise<string | null> {
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: request.suggestedName,
          types: toPickerTypes(request.filters),
        });
        const writable = await handle.createWritable();
        await writable.write(new Uint8Array(toBytes(request.data)));
        await writable.close();
        this.handles.set(handle.name, handle);
        return handle.name;
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return null;
      }
    }
    download(request.suggestedName, request.data);
    return request.suggestedName;
  }

  async writeFile(path: string, data: Uint8Array | string): Promise<string | null> {
    const handle = this.handles.get(baseName(path));
    if (handle) {
      try {
        const writable = await handle.createWritable();
        await writable.write(new Uint8Array(toBytes(data)));
        await writable.close();
        return path;
      } catch {
        // Permission may have lapsed — fall back to a fresh save.
      }
    }
    download(baseName(path), data);
    return path;
  }

  async readSettings(): Promise<Partial<AppSettingsData> | null> {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? (JSON.parse(raw) as Partial<AppSettingsData>) : null;
    } catch {
      return null;
    }
  }

  async writeSettings(settings: AppSettingsData): Promise<void> {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* private mode / quota — settings simply do not persist */
    }
  }

  async readRecentFiles(): Promise<string[]> {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((p) => typeof p === 'string') : [];
    } catch {
      return [];
    }
  }

  async writeRecentFiles(files: string[]): Promise<void> {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(files));
    } catch {
      /* ignore */
    }
  }

  async chooseDirectory(): Promise<string | null> {
    return null; // Browser sample generation downloads each file instead.
  }

  async writeFilesToDirectory(
    _directory: string,
    files: { name: string; data: Uint8Array | string }[],
  ): Promise<number> {
    for (const file of files) download(file.name, file.data);
    return files.length;
  }

  async getStartupFile(): Promise<string | null> {
    return null;
  }

  async readFileByPath(): Promise<OpenedFile | null> {
    return null; // The browser cannot read arbitrary paths.
  }

  async printToPdf(html: string, _suggestedName: string): Promise<string | null> {
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) {
      frame.remove();
      throw new Error('인쇄 프레임을 만들 수 없습니다.');
    }
    doc.open();
    doc.write(html);
    doc.close();
    await new Promise((resolve) => setTimeout(resolve, 250));
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60_000);
    return null;
  }

  setTitle(title: string): void {
    document.title = title;
  }

  onBeforeClose(handler: () => Promise<boolean>): void {
    window.addEventListener('beforeunload', (e) => {
      // The browser only allows a generic prompt; `handler` reports dirty state.
      void handler;
      if (document.title.startsWith('●')) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }
}
