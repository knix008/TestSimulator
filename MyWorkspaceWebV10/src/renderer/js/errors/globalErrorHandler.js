import { showUnexpectedError } from './errorDetail.js';

let installed = false;

export function installGlobalErrorHandler() {
  if (installed) {
    return;
  }
  installed = true;

  window.__mwShowFatalError = ({ title, message, stack, meta = {} }) => {
    showUnexpectedError(
      title || 'JavaScript 오류',
      { message: message || 'JavaScript 오류', stack: stack || '' },
      {
        type: meta.type || 'javascript',
        source: meta.source,
        line: meta.line,
        column: meta.column
      }
    );
  };
}
