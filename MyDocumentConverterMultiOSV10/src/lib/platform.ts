/**
 * Files, on the desktop and in the browser, behind one interface.
 *
 * Under Electron every call goes to the main process, which shows the native
 * dialog and reads or writes the path. In a browser the File System Access
 * API is used where it exists (Chromium) and a file input / download link
 * where it does not, so the same app code runs in both.
 */

export type OpenedFile = {
  name: string
  /** A real path on the desktop; on the web a handle id or empty. */
  path: string
  text?: string
  bytes?: Uint8Array
  size: number
}

export type FileFilter = { name: string; extensions: string[] }

export const isDesktop = () => typeof window !== 'undefined' && Boolean(window.electronFileApi)

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(binary)
}

// Everything is text except the packaged formats and images.
const BINARY_EXTENSIONS = new Set(['docx', 'odt', 'epub', 'pptx', 'pdf', 'zip', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'doc', 'xls', 'xlsx', '7z', 'gz', 'exe', 'dll'])

export function isTextName(name: string) {
  return !BINARY_EXTENSIONS.has(name.toLowerCase().split('.').pop() ?? '')
}

/* A handle kept for web files so Save can write back to the same file. */
const webHandles = new Map<string, FileSystemFileHandle>()
let handleCounter = 0

function rememberHandle(handle: FileSystemFileHandle): string {
  handleCounter += 1
  const id = `web-handle:${handleCounter}:${handle.name}`
  webHandles.set(id, handle)
  return id
}

async function fileToOpened(file: File, path = ''): Promise<OpenedFile> {
  if (isTextName(file.name)) return { name: file.name, path, text: await file.text(), size: file.size }
  return { name: file.name, path, bytes: new Uint8Array(await file.arrayBuffer()), size: file.size }
}

export async function openFiles(options: { defaultPath?: string; filters?: FileFilter[]; multiple?: boolean } = {}): Promise<{ canceled: boolean; files: OpenedFile[]; directory?: string; message?: string }> {
  if (window.electronFileApi) {
    const result = await window.electronFileApi.openFiles({ defaultPath: options.defaultPath || undefined, filters: options.filters, multiple: options.multiple })
    return {
      canceled: result.canceled,
      directory: result.directory,
      message: result.message,
      files: result.files.map((file) => ({ name: file.name, path: file.path, text: file.text, bytes: file.base64 ? base64ToBytes(file.base64) : undefined, size: file.size ?? 0 })),
    }
  }
  const picker = (window as unknown as { showOpenFilePicker?: (options: unknown) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker
  if (picker) {
    try {
      const handles = await picker({ multiple: options.multiple !== false })
      const files: OpenedFile[] = []
      for (const handle of handles) {
        const file = await handle.getFile()
        files.push(await fileToOpened(file, rememberHandle(handle)))
      }
      return { canceled: files.length === 0, files }
    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError') return { canceled: true, files: [] }
      throw error
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = options.multiple !== false
    input.style.display = 'none'
    document.body.appendChild(input)
    input.onchange = async () => {
      const files = await Promise.all([...(input.files ?? [])].map((file) => fileToOpened(file)))
      document.body.removeChild(input)
      resolve({ canceled: files.length === 0, files })
    }
    input.oncancel = () => {
      document.body.removeChild(input)
      resolve({ canceled: true, files: [] })
    }
    input.click()
  })
}

/** Reads a known path (desktop) or a remembered web handle. */
export async function readPath(path: string): Promise<OpenedFile | null> {
  if (window.electronFileApi) {
    const result = await window.electronFileApi.readFile({ filePath: path })
    if (result.canceled || !result.files[0]) throw new Error(result.message || `Cannot read ${path}`)
    const file = result.files[0]
    return { name: file.name, path: file.path, text: file.text, bytes: file.base64 ? base64ToBytes(file.base64) : undefined, size: file.size ?? 0 }
  }
  const handle = webHandles.get(path)
  if (!handle) return null
  return fileToOpened(await handle.getFile(), path)
}

export type SaveResult = { canceled: boolean; path?: string; directory?: string; message?: string }

export async function saveFileAs(options: { fileName: string; defaultDirectory?: string; filters?: FileFilter[]; text?: string; bytes?: Uint8Array; mime?: string }): Promise<SaveResult> {
  if (window.electronFileApi) {
    const result = await window.electronFileApi.saveFile({
      fileName: options.fileName,
      defaultDirectory: options.defaultDirectory || undefined,
      filters: options.filters,
      text: options.bytes ? undefined : options.text ?? '',
      base64: options.bytes ? bytesToBase64(options.bytes) : undefined,
    })
    if (result.canceled) return { canceled: true, message: result.message }
    return { canceled: false, path: result.filePath, directory: result.directory }
  }
  const picker = (window as unknown as { showSaveFilePicker?: (options: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker
  if (picker) {
    try {
      const ext = options.fileName.split('.').pop() ?? ''
      const handle = await picker({
        suggestedName: options.fileName,
        types: options.filters?.filter((filter) => !filter.extensions.includes('*')).map((filter) => ({ description: filter.name, accept: { [options.mime || 'application/octet-stream']: filter.extensions.map((e) => `.${e}`) } })) ?? (ext ? [{ description: ext.toUpperCase(), accept: { [options.mime || 'application/octet-stream']: [`.${ext}`] } }] : []),
      })
      const writable = await handle.createWritable()
      await writable.write(options.bytes ? new Blob([options.bytes as BlobPart]) : options.text ?? '')
      await writable.close()
      return { canceled: false, path: rememberHandle(handle) }
    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError') return { canceled: true }
      throw error
    }
  }
  downloadFile(options.fileName, options.bytes ?? options.text ?? '', options.mime)
  return { canceled: false, path: '' }
}

export async function writePath(path: string, content: { text?: string; bytes?: Uint8Array }): Promise<SaveResult> {
  if (window.electronFileApi) {
    const result = await window.electronFileApi.writeFile({ filePath: path, text: content.bytes ? undefined : content.text ?? '', base64: content.bytes ? bytesToBase64(content.bytes) : undefined })
    if (result.canceled) return { canceled: true, message: result.message }
    return { canceled: false, path: result.filePath, directory: result.directory }
  }
  const handle = webHandles.get(path)
  if (!handle) return { canceled: true, message: 'No file handle' }
  const writable = await handle.createWritable()
  await writable.write(content.bytes ? new Blob([content.bytes as BlobPart]) : content.text ?? '')
  await writable.close()
  return { canceled: false, path }
}

export function downloadFile(name: string, content: string | Uint8Array, mime = 'application/octet-stream') {
  const blob = content instanceof Uint8Array ? new Blob([content as BlobPart], { type: mime }) : new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export async function chooseDirectory(defaultPath?: string): Promise<{ canceled: boolean; directory?: string }> {
  if (window.electronFileApi) return window.electronFileApi.chooseDirectory({ defaultPath: defaultPath || undefined })
  return { canceled: true }
}

export function directoryOf(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return index > 0 ? path.slice(0, index) : ''
}

export function joinPath(directory: string, name: string): string {
  if (!directory) return name
  const sep = directory.includes('\\') && !directory.includes('/') ? '\\' : '/'
  return directory.endsWith(sep) ? `${directory}${name}` : `${directory}${sep}${name}`
}

export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

export function stripExtension(name: string): string {
  const index = name.lastIndexOf('.')
  return index > 0 ? name.slice(0, index) : name
}
