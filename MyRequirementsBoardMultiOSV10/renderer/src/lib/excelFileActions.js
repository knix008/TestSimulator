function base64ToFile(base64, fileName) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const lower = String(fileName || '').toLowerCase();
  const mime = lower.endsWith('.xls')
    ? 'application/vnd.ms-excel'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return new File([bytes], fileName, { type: mime });
}

export async function pickExcelFile() {
  if (window.electronAPI?.openExcelFile) {
    const result = await window.electronAPI.openExcelFile();
    if (result.canceled) return null;
    return {
      file: base64ToFile(result.base64, result.fileName),
      filePath: result.filePath,
    };
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
    input.onchange = () => {
      const file = input.files?.[0];
      resolve(file ? { file, filePath: file.name } : null);
    };
    input.click();
  });
}
