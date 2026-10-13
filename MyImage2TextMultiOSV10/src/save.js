export function isTauri() {
  return '__TAURI_INTERNALS__' in window;
}

export async function saveAs({ text, bytes, defaultName, filterName, extensions, mime }) {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('save_file', {
      req: {
        text: text ?? null,
        bytesBase64: bytes ? bytesToBase64(bytes) : null,
        defaultName,
        filterName,
        extensions,
      },
    });
  }

  const blob =
    text != null
      ? new Blob([text], { type: mime || 'text/plain;charset=utf-8' })
      : new Blob([bytes], { type: mime || 'application/octet-stream' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = defaultName;
  link.click();
  URL.revokeObjectURL(link.href);
  return true;
}

function bytesToBase64(bytes) {
  const parts = [];
  const chunk = 0x1000;
  for (let index = 0; index < bytes.length; index += chunk) {
    const slice = bytes.subarray(index, index + chunk);
    const copy = new Array(slice.length);
    for (let offset = 0; offset < slice.length; offset += 1) copy[offset] = slice[offset];
    parts.push(String.fromCharCode.apply(null, copy));
  }
  return btoa(parts.join(''));
}
