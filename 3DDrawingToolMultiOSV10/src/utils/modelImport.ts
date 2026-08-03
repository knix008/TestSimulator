import type { ModelFormat, SceneObject } from '../types';
import { useAppStore } from '../store/useAppStore';

export const MODEL_FILE_ACCEPT = '.glb,.gltf,.obj,.stl,.fbx,.ply,model/gltf-binary,model/gltf+json,model/obj,model/stl';
export const IMAGE_FILE_ACCEPT = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp';
export const MODEL_ACCEPT =
  `${MODEL_FILE_ACCEPT},${IMAGE_FILE_ACCEPT}`;

const EXT_TO_FORMAT: Record<string, ModelFormat> = {
  glb: 'glb',
  gltf: 'gltf',
  obj: 'obj',
  stl: 'stl',
  fbx: 'fbx',
  ply: 'ply',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
};

export function detectFormat(fileName: string): ModelFormat | null {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return EXT_TO_FORMAT[ext] ?? null;
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function importModelFiles(files: FileList | File[]): Promise<SceneObject[]> {
  const list = Array.from(files);
  const created: SceneObject[] = [];

  for (const file of list) {
    const format = detectFormat(file.name);
    if (!format) {
      useAppStore.getState().showError({
        title: 'Import failed',
        message: `Unsupported format: ${file.name}`,
        details: `File: ${file.name}`,
      });
      continue;
    }

    try {
      const dataUrl = await readAsDataURL(file);
      const obj = useAppStore.getState().addImportedAsset({
        name: file.name.replace(/\.[^.]+$/, ''),
        format,
        dataUrl,
        sourceFileName: file.name,
      });
      created.push(obj);
    } catch (error) {
      useAppStore.getState().showError({
        title: 'Import failed',
        message: `Failed to load: ${file.name}`,
        details: error instanceof Error ? [error.name, error.message, error.stack].filter(Boolean).join('\n\n') : String(error),
      });
    }
  }

  return created;
}

function pickAndImportFiles(accept: string): Promise<SceneObject[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = true;
    input.onchange = async () => {
      if (!input.files?.length) {
        resolve([]);
        return;
      }
      const created = await importModelFiles(input.files);
      resolve(created);
    };
    input.click();
  });
}

export function pickAndImportModels(): Promise<SceneObject[]> {
  return pickAndImportFiles(MODEL_FILE_ACCEPT);
}

export function pickAndImportImages(): Promise<SceneObject[]> {
  return pickAndImportFiles(IMAGE_FILE_ACCEPT);
}
