function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function exportExcelToFile(projectId, ids = null) {
  const qs = ids?.length ? `?ids=${ids.join(',')}` : '';
  const url = `/api/projects/${projectId}/excel/export${qs}`;

  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `내보내기 실패 (${res.status})`);
  }
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^";\s]+)"?/i);
  const fileName = match?.[1] || 'requirements.xlsx';
  const blob = await res.blob();

  if (window.electronAPI?.saveExcelFile) {
    const base64 = await blobToBase64(blob);
    const result = await window.electronAPI.saveExcelFile(base64, fileName);
    if (result.canceled) return null;
    return { filePath: result.filePath, fileName };
  }

  // Browser fallback: trigger download
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
  return { filePath: null, fileName };
}

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
