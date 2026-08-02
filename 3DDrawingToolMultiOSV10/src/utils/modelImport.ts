import type { ModelFormat, SceneObject } from '../types';
import { useAppStore } from '../store/useAppStore';

export const MODEL_ACCEPT =
  '.glb,.gltf,.obj,.stl,.fbx,.ply,.png,.jpg,.jpeg,.webp,model/gltf-binary,model/gltf+json,model/obj,model/stl,image/png,image/jpeg,image/webp';

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
      alert(`Unsupported format: ${file.name}`);
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
    } catch {
      alert(`Failed to load: ${file.name}`);
    }
  }

  return created;
}

export function pickAndImportModels(): Promise<SceneObject[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = MODEL_ACCEPT;
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
