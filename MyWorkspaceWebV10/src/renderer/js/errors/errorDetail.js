import { openModal, closeModal, createButton } from '../dialogs/modals.js';
import { copyErrorText, formatErrorReport, prepareErrorTextarea } from './errorReport.js';

export function showErrorDetailDialog(title, summary, details, meta = {}) {
  const reportText = formatErrorReport({
    title,
    message: summary,
    details,
    stack: details,
    ...meta
  });

  const body = document.createElement('div');
  body.className = 'error-detail-body';

  const hintEl = document.createElement('p');
  hintEl.className = 'error-copy-hint';
  hintEl.textContent = '아래 내용을 선택하거나 "오류 복사"를 눌러 채팅 등에 붙여넣을 수 있습니다.';

  const summaryEl = document.createElement('p');
  summaryEl.className = 'error-detail-summary';
  summaryEl.textContent = summary || '오류가 발생했습니다.';

  const detailsEl = document.createElement('textarea');
  detailsEl.className = 'error-detail-text';
  detailsEl.readOnly = true;
  detailsEl.spellcheck = false;
  detailsEl.value = reportText;

  body.append(hintEl, summaryEl, detailsEl);

  const copyButton = createButton('오류 복사', {
    onClick: async () => {
      await copyErrorText(detailsEl.value, { button: copyButton, hintContainer: body });
    }
  });

  openModal({
    title: title || '오류',
    bodyNode: body,
    footerNodes: [copyButton, createButton('닫기', { primary: true, onClick: closeModal })]
  });

  prepareErrorTextarea(detailsEl, reportText, {
    autoCopy: true,
    hintContainer: body,
    copyButton
  });
}

export function showApiError(title, result, fallbackSummary) {
  if (result?.cancelled) {
    return;
  }
  showErrorDetailDialog(
    title,
    result?.message || fallbackSummary || '오류가 발생했습니다.',
    result?.details || result?.message || '',
    { type: 'api' }
  );
}

export async function invokeApi(title, call, { fallbackSummary } = {}) {
  const result = await call();
  if (result?.ok === false && !result?.cancelled) {
    showApiError(title, result, fallbackSummary);
    return null;
  }
  return result;
}

export function showUnexpectedError(title, error, meta = {}) {
  const message = error?.message || String(error || '오류가 발생했습니다.');
  const stack = error?.stack || '';
  showErrorDetailDialog(title, message, stack, { type: meta.type || 'javascript', ...meta });
}
