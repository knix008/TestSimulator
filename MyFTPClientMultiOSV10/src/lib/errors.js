// Error → { message, detail } for the error dialog (kept out of the
// component file so Vite's Fast Refresh keeps working).
import { t } from './i18n';

// Splits an Error (or a plain message) into what the error dialog shows.
export function describeError(err, extra) {
  if (typeof err === 'string') return { message: err, detail: extra || '' };
  if (!err) return { message: t('error_unexpected'), detail: extra || '' };
  const lines = [];
  if (err.code && err.code !== 'ERROR') lines.push(`${t('error_code')}: ${err.code}`);
  if (err.path) lines.push(`${t('error_path')}: ${err.path}`);
  if (err.syscall) lines.push(`syscall: ${err.syscall}`);
  if (extra) lines.push(extra);
  if (err.stack) lines.push('', err.stack);
  return { message: err.message || String(err), detail: lines.join('\n').trim() };
}
