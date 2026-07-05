import { buildEditorDocument } from './editor/winEditorPage.js';
import { htmlToMarkdown, extractTitleFromHtml } from './editor/htmlToMarkdown.js';

export function createEditorBridge(frame) {
  let ready = false;
  let loadGeneration = 0;

  function handleMessage(event) {
    if (event.source !== frame.contentWindow) {
      return;
    }

    const message = event.data;
    if (!message || typeof message !== 'object') {
      return;
    }

    if (message.channel === 'editor-webview') {
      if (message.raw === 'changed') {
        bridge.onChanged?.();
      } else if (message.raw === 'caret') {
        bridge.onCaret?.();
        updateHeadingsFromEditor();
      } else if (message.type === 'open' && message.href) {
        bridge.onOpenResource?.(message.href);
      } else if (message.type === 'paste-clipboard') {
        bridge.onPasteRequested?.();
      } else if (message.type === 'clone-pasted-html' && message.html) {
        bridge.onClonePastedHtml?.(message.html);
      } else if (message.type === 'file-drop') {
        bridge.onFileDrop?.(message);
      } else if (message.type === 'contextmenu') {
        bridge.onContextMenuRequested?.({ x: message.x, y: message.y });
      } else if (message.type === 'editor-pointer-down') {
        bridge.onEditorPointerDown?.();
      }
      return;
    }
  }

  window.addEventListener('message', handleMessage);

  async function waitForEditorApi(timeoutMs = 15000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      try {
        const api = frame.contentWindow?.editorApi;
        if (api) {
          ready = true;
          return api;
        }
      } catch {
        // Cross-origin or not ready yet.
      }
      await delay(30);
    }
    throw new Error(
      'Editor failed to initialize. 편집기 스크립트가 실행되지 않았습니다. 앱을 다시 시작해 보세요.'
    );
  }

  async function getApi() {
    if (frame.contentWindow?.editorApi) {
      return frame.contentWindow.editorApi;
    }
    return waitForEditorApi();
  }

  async function updateHeadingsFromEditor() {
    try {
      const api = await getApi();
      const json = api.getHeadings();
      const headings = JSON.parse(json);
      bridge.onHeadingsChanged?.(headings);
    } catch {
      bridge.onHeadingsChanged?.([]);
    }
  }

  const bridge = {
    onChanged: null,
    onCaret: null,
    onHeadingsChanged: null,
    onOpenResource: null,
    onPasteRequested: null,
    onClonePastedHtml: null,
    onFileDrop: null,
    onContextMenuRequested: null,
    onEditorPointerDown: null,

    async loadMarkdown(markdown) {
      const generation = ++loadGeneration;
      ready = false;
      const html = await buildEditorDocument(markdown);
      frame.srcdoc = html;
      await waitForEditorApi();
      if (generation !== loadGeneration) {
        return;
      }
      const api = await getApi();
      api.finalizeImageSizes?.();
      api.focus?.();
      frame.focus?.();
      await updateHeadingsFromEditor();
    },

    async focus() {
      try {
        const api = await getApi();
        api.focus?.();
        frame.focus?.();
      } catch {
        // Editor not ready.
      }
    },

    async readContent(fallbackTitle = '제목없음') {
      const api = await getApi();
      const html = api.getHtml();
      return {
        markdown: htmlToMarkdown(html),
        title: extractTitleFromHtml(html, fallbackTitle),
        html
      };
    },

    async runCommand(item) {
      const api = await getApi();
      switch (item.command) {
        case 'undo':
          api.undo();
          break;
        case 'redo':
          api.redo();
          break;
        case 'heading':
          api.applyHeading(item.level || 1);
          break;
        case 'bold':
        case 'italic':
        case 'strikeThrough':
        case 'underline':
        case 'insertUnorderedList':
        case 'insertOrderedList':
          api.applyFormat(item.command);
          break;
        case 'inlineCode':
          api.wrapInlineCode();
          break;
        case 'blockquote':
          api.applyBlockquote();
          break;
        case 'horizontalRule':
          api.insertHtml('<hr/><p><br></p>');
          break;
        case 'codeBlock':
          api.insertHtml('<pre><code>code</code></pre><p><br></p>');
          break;
        case 'table':
          await bridge.insertTable(item.rows, item.cols);
          break;
        case 'link':
          await bridge.insertLink();
          break;
        case 'image':
        case 'attach':
          bridge.onAssetInsertRequested?.(item.command);
          break;
        default:
          break;
      }
      await updateHeadingsFromEditor();
    },

    async insertLink() {
      const api = await getApi();
      api.saveInsertMarker?.();
      if (bridge.promptLink) {
        const result = await bridge.promptLink();
        if (!result) {
          api.clearInsertMarker?.();
          return;
        }
        api.createLink(result.text, result.url);
        return;
      }
      const url = window.prompt('링크 URL');
      if (!url) {
        api.clearInsertMarker?.();
        return;
      }
      const text = window.prompt('표시 텍스트', url) || url;
      api.createLink(text, url);
    },

    async scrollToHeading(id) {
      const api = await getApi();
      api.scrollToHeading(id);
    },

    async applyTheme(theme) {
      try {
        const api = await getApi();
        api.applyThemeChrome?.(theme);
      } catch {
        // Editor not loaded yet.
      }
    },

    async insertTable(rows = 3, cols = 3) {
      const api = await getApi();
      api.insertHtml(buildTableHtml(rows, cols));
    },

    async insertHtml(html) {
      const api = await getApi();
      api.insertHtml(html);
    },

    async insertPlainText(text) {
      const api = await getApi();
      api.insertPlainText?.(text);
    },

    async getContextMenuContext(x, y) {
      const api = await getApi();
      const json = api.getContextMenuContext?.(x, y);
      if (!json) {
        return { target: 'editor' };
      }
      try {
        return JSON.parse(json);
      } catch {
        return { target: 'editor' };
      }
    },

    async getSelectedText() {
      const api = await getApi();
      return api.getSelectedText?.() || '';
    },

    async applyFormat(command) {
      const api = await getApi();
      api.applyFormat?.(command);
      await updateHeadingsFromEditor();
    },

    async selectAll() {
      const api = await getApi();
      api.focus?.();
      frame.contentWindow?.document?.execCommand?.('selectAll');
    },

    async callEditorMethod(methodName, ...args) {
      const api = await getApi();
      const method = api[methodName];
      if (typeof method !== 'function') {
        return false;
      }
      const result = method.apply(api, args);
      await updateHeadingsFromEditor();
      if (result !== false) {
        bridge.onChanged?.();
      }
      return result;
    },

    promptLink: null
  };

  return bridge;
}

function buildTableHtml(rows, cols) {
  let html = '<table><tbody>';
  for (let r = 0; r < rows; r += 1) {
    html += '<tr>';
    for (let c = 0; c < cols; c += 1) {
      html += r === 0 ? '<th>&nbsp;</th>' : '<td>&nbsp;</td>';
    }
    html += '</tr>';
  }
  html += '</tbody></table><p><br></p>';
  return html;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
