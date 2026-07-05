(() => {
  function formatErrorReport({ title, message, details, stack, source, line, column, type } = {}) {
    const lines = ['=== MyWorkspace 오류 ==='];
    if (title) {
      lines.push(`제목: ${title}`);
    }
    if (message) {
      lines.push(`메시지: ${message}`);
    }
    if (type) {
      lines.push(`유형: ${type}`);
    }
    if (source) {
      lines.push(`위치: ${source}${line ? `:${line}` : ''}${column ? `:${column}` : ''}`);
    }
    lines.push('---');
    const body = details || stack || message || '';
    lines.push(body);
    return lines.join('\n');
  }

  async function copyToClipboard(text) {
    if (!text) {
      return false;
    }
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      return copied;
    }
  }

  function setCopyButtonLabel(button, copied) {
    if (!button) {
      return;
    }
    button.textContent = copied ? '복사됨' : '오류 복사';
    button.dataset.copied = copied ? 'true' : 'false';
  }

  function showCopyHint(container, copied) {
    if (!container) {
      return;
    }
    let hint = container.querySelector('.error-copy-hint');
    if (!hint) {
      hint = document.createElement('p');
      hint.className = 'error-copy-hint';
      container.insertBefore(hint, container.querySelector('.error-detail-text, .fatal-error-details'));
    }
    hint.textContent = copied
      ? '클립보드에 복사되었습니다. 채팅 등에 붙여넣어 공유하세요.'
      : '아래 내용을 선택하거나 "오류 복사"를 눌러 채팅 등에 붙여넣을 수 있습니다.';
    hint.dataset.state = copied ? 'copied' : 'ready';
  }

  async function copyErrorText(text, { button, hintContainer } = {}) {
    const copied = await copyToClipboard(text);
    if (copied) {
      setCopyButtonLabel(button, true);
      showCopyHint(hintContainer, true);
      window.setTimeout(() => setCopyButtonLabel(button, false), 2000);
    }
    return copied;
  }

  function prepareErrorTextarea(textarea, text, { autoCopy = true, hintContainer, copyButton } = {}) {
    if (!textarea) {
      return;
    }
    textarea.value = text || '';
    textarea.focus();
    textarea.select();

    if (autoCopy) {
      window.setTimeout(async () => {
        await copyErrorText(text, { button: copyButton, hintContainer });
      }, 0);
    } else {
      showCopyHint(hintContainer, false);
    }
  }

  window.__mwErrorReport = {
    formatErrorReport,
    copyToClipboard,
    copyErrorText,
    setCopyButtonLabel,
    showCopyHint,
    prepareErrorTextarea
  };
})();
