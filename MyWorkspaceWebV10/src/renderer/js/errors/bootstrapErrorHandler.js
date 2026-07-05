(() => {
  let lastErrorKey = '';

  const report = () => window.__mwErrorReport;

  function normalizeError(errorLike, fallbackMessage) {
    if (errorLike instanceof Error) {
      return {
        message: errorLike.message || fallbackMessage || '알 수 없는 오류',
        stack: errorLike.stack || ''
      };
    }
    if (typeof errorLike === 'string') {
      return { message: errorLike, stack: '' };
    }
    if (errorLike && typeof errorLike === 'object') {
      const message = errorLike.message || errorLike.toString?.() || fallbackMessage || '알 수 없는 오류';
      return { message: String(message), stack: errorLike.stack || '' };
    }
    return { message: fallbackMessage || '알 수 없는 오류', stack: '' };
  }

  function buildDetails(message, stack, meta) {
    const format = report()?.formatErrorReport;
    if (format) {
      return format({
        title: 'JavaScript 오류',
        message,
        details: stack || message,
        source: meta.source,
        line: meta.line,
        column: meta.column,
        type: meta.type
      });
    }

    const lines = [message];
    if (meta?.source) {
      lines.push('', `위치: ${meta.source}${meta.line ? `:${meta.line}` : ''}`);
    }
    if (meta?.type) {
      lines.push(`유형: ${meta.type}`);
    }
    if (stack) {
      lines.push('', stack);
    }
    return lines.join('\n');
  }

  function reportToMain(payload) {
    try {
      window.myworkspace?.reportRendererError?.(payload);
    } catch {
      // preload가 아직 준비되지 않았을 수 있음
    }
  }

  function showFallbackOverlay(title, message, details) {
    document.getElementById('login-screen')?.classList.add('hidden');
    document.getElementById('app-shell')?.classList.add('hidden');

    let screen = document.getElementById('fatal-error-screen');
    if (!screen) {
      screen = document.createElement('div');
      screen.id = 'fatal-error-screen';
      screen.className = 'fatal-error-screen';
      screen.innerHTML = `
        <div class="fatal-error-card">
          <h1 class="fatal-error-title"></h1>
          <p class="fatal-error-summary"></p>
          <p class="error-copy-hint">아래 내용을 선택하거나 "오류 복사"를 눌러 채팅 등에 붙여넣을 수 있습니다.</p>
          <textarea class="fatal-error-details" readonly spellcheck="false"></textarea>
          <div class="fatal-error-actions">
            <button type="button" class="fatal-error-copy">오류 복사</button>
            <button type="button" class="fatal-error-reload">다시 시도</button>
          </div>
        </div>
      `;
      document.body.appendChild(screen);

      const copyButton = screen.querySelector('.fatal-error-copy');
      const card = screen.querySelector('.fatal-error-card');

      copyButton.addEventListener('click', async () => {
        const text = screen.querySelector('.fatal-error-details').value;
        await report()?.copyErrorText(text, { button: copyButton, hintContainer: card });
      });

      screen.querySelector('.fatal-error-reload').addEventListener('click', () => {
        window.location.reload();
      });
    }

    const copyButton = screen.querySelector('.fatal-error-copy');
    const card = screen.querySelector('.fatal-error-card');
    const detailsEl = screen.querySelector('.fatal-error-details');

    screen.querySelector('.fatal-error-title').textContent = title;
    screen.querySelector('.fatal-error-summary').textContent = message;
    screen.classList.remove('hidden');

    report()?.prepareErrorTextarea(detailsEl, details, {
      autoCopy: true,
      hintContainer: card,
      copyButton
    });
  }

  function handleFatalError(errorLike, meta = {}) {
    const { message, stack } = normalizeError(errorLike, meta.fallbackMessage);
    const details = buildDetails(message, stack, meta);
    const errorKey = `${message}\n${details}`;

    if (errorKey === lastErrorKey) {
      return;
    }
    lastErrorKey = errorKey;

    reportToMain({
      message,
      stack,
      source: meta.source,
      line: meta.line,
      column: meta.column,
      type: meta.type || 'error'
    });

    if (typeof window.__mwShowFatalError === 'function') {
      window.__mwShowFatalError({
        title: 'JavaScript 오류',
        message,
        stack,
        meta
      });
      return;
    }

    showFallbackOverlay('JavaScript 오류', message, details);
  }

  window.addEventListener(
    'error',
    (event) => {
      handleFatalError(event.error || new Error(event.message || 'JavaScript 오류'), {
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        type: 'error'
      });
    },
    true
  );

  window.addEventListener('unhandledrejection', (event) => {
    handleFatalError(event.reason, { type: 'unhandledrejection' });
  });

  window.__mwHandleFatalError = handleFatalError;
})();
