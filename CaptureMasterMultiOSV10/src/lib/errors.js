// Error shaping: everything shown to the user carries a title, the message and
// the technical details, all of which can be copied from the error dialog.

export function describeError(err, context = '') {
  const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err));
  // Electron prefixes IPC errors with the handler name; strip it for the headline.
  const message = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  return {
    context,
    message,
    name: e.name || 'Error',
    stack: e.stack || '',
    time: new Date().toISOString(),
  };
}

export function errorToText(info, appInfo) {
  const lines = [
    `CaptureMaster ${appInfo && appInfo.version ? 'v' + appInfo.version : ''}`.trim(),
    `Time: ${info.time}`,
    info.context ? `Context: ${info.context}` : null,
    `Error: ${info.name}: ${info.message}`,
    '',
    info.stack || '',
    '',
    appInfo ? `Platform: ${appInfo.platform} ${appInfo.arch} · Electron ${appInfo.electron || '-'} · Chromium ${appInfo.chrome || '-'}` : null,
  ];
  return lines.filter((l) => l !== null).join('\n');
}
