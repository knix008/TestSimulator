import { isTauri } from './save.js';

export async function pickImages(title, directory) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('pick_images', { title: title || null, directory: directory || null });
}

export async function saveTexts(files) {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('save_texts', { files });
  }
  if (typeof window.showDirectoryPicker === 'function') {
    try {
      const directory = await window.showDirectoryPicker();
      for (const file of files) {
        const handle = await directory.getFileHandle(`${file.name}.txt`, { create: true });
        const writable = await handle.createWritable();
        await writable.write(file.text);
        await writable.close();
      }
      return true;
    } catch (error) {
      if (error?.name === 'AbortError') return false;
      throw error;
    }
  }
  for (const file of files) {
    const blob = new Blob([file.text], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${file.name}.txt`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
  return true;
}

export async function readInstallLanguage() {
  if (!isTauri()) return '';
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const value = await invoke('install_language');
    return value === 'en' || value === 'ko' ? value : '';
  } catch {
    return '';
  }
}

export async function printPage() {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('print_page');
  }
  window.print();
}

// Printing straight to a printer (desktop app on Windows). The browser has no printer list.
export async function listPrinters() {
  if (!isTauri()) return { printers: [], defaultPrinter: '', filePrinters: [], direct: false };
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('list_printers');
}

export async function printDirect(job) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('print_direct', { job });
}

export async function printPdf(job, path) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('print_pdf', { job, path });
}

export async function pickPdfPath(defaultName, title) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('pick_pdf_path', { defaultName, title });
}

export async function readImage(path) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('read_image', { path });
}

export function fileFromEncoded(image) {
  const bytes = base64ToBytes(image.bytesBase64);
  return new File([bytes], image.name || 'image');
}

export function pathOf(file) {
  return typeof file?.path === 'string' ? file.path : '';
}

export { isTauri };

function base64ToBytes(encoded) {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
