export function isMarkdownFileName(fileName) {
  const value = String(fileName || '').trim().toLowerCase();
  return value.endsWith('.md') || value.endsWith('.markdown');
}

export function resolveDroppedFilePath(file) {
  if (!file) {
    return '';
  }

  if (typeof file.path === 'string' && file.path) {
    return file.path;
  }

  try {
    return window.myworkspace?.getPathForFile?.(file) || '';
  } catch {
    return '';
  }
}

export function isMarkdownFileDrag(event) {
  const types = Array.from(event.dataTransfer?.types || []);
  if (!types.includes('Files')) {
    return false;
  }

  const files = Array.from(event.dataTransfer?.files || []);
  if (files.length) {
    return files.some((file) => isMarkdownFileName(file.name || resolveDroppedFilePath(file)));
  }

  const items = Array.from(event.dataTransfer?.items || []);
  if (items.length) {
    return items.some((item) => item.kind === 'file');
  }

  return true;
}

export function collectMarkdownPathsFromDataTransfer(dataTransfer) {
  const files = Array.from(dataTransfer?.files || []);
  const paths = [];

  for (const file of files) {
    const filePath = resolveDroppedFilePath(file);
    const fileName = file.name || filePath;
    if (!filePath || !isMarkdownFileName(fileName)) {
      continue;
    }
    paths.push(filePath);
  }

  return [...new Set(paths)];
}

export function partitionDroppedFiles(files) {
  const markdownPaths = [];
  const otherFiles = [];

  for (const file of files) {
    const filePath = resolveDroppedFilePath(file);
    const fileName = file.name || filePath;
    if (filePath && isMarkdownFileName(fileName)) {
      markdownPaths.push(filePath);
      continue;
    }
    otherFiles.push(file);
  }

  return {
    markdownPaths: [...new Set(markdownPaths)],
    otherFiles
  };
}
