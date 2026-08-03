import type { Language, ProjectData } from '../types';
import { useAppStore } from '../store/useAppStore';

const isElectron = () => Boolean(window.electronAPI?.isElectron);

export interface TemplateInfo {
  id: string;
  file: string;
  title: { ko: string; en: string };
  description: { ko: string; en: string };
}

export interface TemplateCatalog {
  version: string;
  templates: TemplateInfo[];
}

export async function loadTemplateCatalog(): Promise<TemplateCatalog> {
  const base = import.meta.env.BASE_URL || '/';
  const res = await fetch(`${base}template/index.json`);
  if (!res.ok) throw new Error('Failed to load template catalog');
  return (await res.json()) as TemplateCatalog;
}

export async function loadTemplate(file: string): Promise<boolean> {
  try {
    const base = import.meta.env.BASE_URL || '/';
    const res = await fetch(`${base}template/${file}`);
    if (!res.ok) throw new Error(`Template not found: ${file}`);
    const data = (await res.json()) as ProjectData;
    useAppStore.getState().importProject(data, file);
    useAppStore.getState().setProjectName(data.name || file.replace(/\.3ddraw$/i, ''));
    return true;
  } catch (err) {
    useAppStore.getState().showError({
      title: 'Template load failed',
      message: `Failed to load template: ${file}`,
      details: err instanceof Error ? [err.name, err.message, err.stack].filter(Boolean).join('\n\n') : String(err),
    });
    return false;
  }
}

export function templateLabel(info: TemplateInfo, lang: Language): string {
  return info.title[lang] || info.title.en;
}

export function templateDescription(info: TemplateInfo, lang: Language): string {
  return info.description[lang] || info.description.en;
}

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
    } catch (err) {
      useAppStore.getState().showError({
        title: 'Open failed',
        message: 'Invalid project file.',
        details: err instanceof Error ? [err.name, err.message, err.stack].filter(Boolean).join('\n\n') : String(err),
      });
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
      } catch (err) {
        useAppStore.getState().showError({
          title: 'Open failed',
          message: 'Invalid project file.',
          details: err instanceof Error ? [err.name, err.message, err.stack].filter(Boolean).join('\n\n') : String(err),
        });
        resolve(false);
      }
    };
    input.click();
  });
}
