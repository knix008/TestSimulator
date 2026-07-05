export function formatErrorReport(payload) {
  return window.__mwErrorReport?.formatErrorReport(payload) ?? payload?.details ?? payload?.message ?? '';
}

export async function copyErrorText(text, options) {
  if (window.__mwErrorReport?.copyErrorText) {
    return window.__mwErrorReport.copyErrorText(text, options);
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function prepareErrorTextarea(textarea, text, options) {
  window.__mwErrorReport?.prepareErrorTextarea(textarea, text, options);
}
