import type { ProjectData } from '../types';
import { useAppStore } from '../store/useAppStore';

const isElectron = () => Boolean(window.electronAPI?.isElectron);

export async function saveProject(): Promise<boolean> {
  const data = useAppStore.getState().exportProject();
  const json = JSON.stringify(data, null, 2);

  if (isElectron() && window.electronAPI) {
    const result = await window.electronAPI.saveProject(json);
    if (!result.canceled && result.filePath) {
      const name = result.filePath.split(/[/\\]/).pop()?.replace(/\.(3ddraw|json)$/i, '') || data.name;
      useAppStore.getState().setProjectName(name);
      return true;
    }
    return false;
  }

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.name || 'untitled'}.3ddraw`;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

export async function openProject(): Promise<boolean> {
  if (isElectron() && window.electronAPI) {
    const result = await window.electronAPI.openProject();
    if (result.canceled || !result.data) return false;
    try {
      const data = JSON.parse(result.data) as ProjectData;
      useAppStore.getState().importProject(data, result.filePath);
      return true;
    } catch {
      alert('Invalid project file.');
      return false;
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.3ddraw,.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(false);
        return;
      }
      try {
        const text = await file.text();
        const data = JSON.parse(text) as ProjectData;
        useAppStore.getState().importProject(data, file.name);
        resolve(true);
      } catch {
        alert('Invalid project file.');
        resolve(false);
      }
    };
    input.click();
  });
}
