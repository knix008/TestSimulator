function downloadJsonFile(content, fileName) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function pickProjectFileContent() {
  if (window.electronAPI?.openProjectFile) {
    const result = await window.electronAPI.openProjectFile();
    if (result.canceled) return null;
    return JSON.parse(result.content);
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.reqtproj,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(await file.text()));
      } catch {
        resolve(null);
      }
    };
    input.click();
  });
}

export async function readProjectFileContent(filePath) {
  if (window.electronAPI?.readProjectFile) {
    const result = await window.electronAPI.readProjectFile(filePath);
    return JSON.parse(result.content);
  }
  return null;
}

export async function saveProjectFileContent(payload, defaultName) {
  const content = JSON.stringify(payload, null, 2);
  const fileName = defaultName || `${payload.projectName || 'project'}.reqtproj`;

  if (window.electronAPI?.saveProjectFile) {
    return window.electronAPI.saveProjectFile(content, fileName);
  }

  downloadJsonFile(content, fileName);
  return { canceled: false, filePath: fileName };
}

export function defaultProjectFileName(projectName) {
  const safe = String(projectName || 'project')
    .trim()
    .replace(/[<>:"/\\|?*]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 48) || 'project';
  return `${safe}.reqtproj`;
}
