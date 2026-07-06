import { buildEditorDocument } from './editor/winEditorPage.js';
import { htmlToMarkdown, extractTitleFromHtml } from './editor/htmlToMarkdown.js';
import {
  persistSizedImagesInMarkdown,
  repairCorruptedImageMarkdown,
  collapseEditorImagesInMarkdown,
  collapseEditorFileLinksInMarkdown
} from './editor/pageMarkdownNormalizer.js';
import { buildEditorThemeChrome } from './ui/editorTheme.js';

export function createEditorBridge(frame) {
  let ready = false;
  let loadGeneration = 0;
  let appearance = { theme: 'light', fontScaleStep: 0 };

  function normalizeAppearance({
    theme = 'light',
    fontScaleStep = 0,
    colorThemeIndex,
    useCustomAccentColor,
    customAccentArgb
  } = {}) {
    return {
      theme: theme === 'dark' || String(theme).toLowerCase() === 'dark' ? 'dark' : 'light',
      fontScaleStep: Number(fontScaleStep) || 0,
      colorThemeIndex,
      useCustomAccentColor,
      customAccentArgb
    };
  }

  async function applyThemeChromeToEditor(api, chromeAppearance) {
    api.applyThemeChrome?.(buildEditorThemeChrome(chromeAppearance));
  }

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
      } else if (message.type === 'resolve-page-asset') {
        bridge.onResolvePageAsset?.(message);
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

  async function getApi({ wait = true } = {}) {
    if (frame.contentWindow?.editorApi) {
      return frame.contentWindow.editorApi;
    }
    if (!wait) {
      return null;
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
    onResolvePageAsset: null,

    postToFrame(payload) {
      frame.contentWindow?.postMessage(Object.assign({ channel: 'editor-webview' }, payload), '*');
    },

    async loadMarkdown(markdown, pageId = null, appearanceOverride = null) {
      const generation = ++loadGeneration;
      ready = false;
      const chromeAppearance = normalizeAppearance(appearanceOverride || appearance);
      if (appearanceOverride) {
        appearance = chromeAppearance;
      }
      const html = await buildEditorDocument(markdown, pageId, chromeAppearance);
      frame.srcdoc = html;
      await waitForEditorApi();
      if (generation !== loadGeneration) {
        return;
      }
      const api = await getApi();
      api.finalizeImageSizes?.();
      api.refreshEditorBlocks?.();
      await applyThemeChromeToEditor(api, chromeAppearance);
      if (generation !== loadGeneration) {
        return;
      }
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

    async readContent(fallbackTitle = '제목없음', pageId = null) {
      const api = await getApi();
      api.finalizeImageSizes?.();
      const html = api.getHtml();
      let markdown = htmlToMarkdown(html);
      if (pageId != null) {
        markdown = persistSizedImagesInMarkdown(markdown, pageId);
        markdown = repairCorruptedImageMarkdown(markdown);
        markdown = collapseEditorImagesInMarkdown(markdown, pageId);
        markdown = collapseEditorFileLinksInMarkdown(markdown, pageId);
      }
      return {
        markdown,
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

    async scrollToSearchText(query, matchInContent = false) {
      const api = await getApi();
      return Boolean(api.scrollToSearchText?.(query, matchInContent));
    },

    async applyAppearance(nextAppearance = {}) {
      appearance = normalizeAppearance(nextAppearance);
      try {
        const api = await getApi();
        await applyThemeChromeToEditor(api, appearance);
      } catch {
        // Editor not ready yet; appearance will be applied on the next loadMarkdown.
      }
    },

    async applyTheme(theme) {
      await bridge.applyAppearance({ theme, fontScaleStep: appearance.fontScaleStep });
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
  const rowCount = Math.min(20, Math.max(1, rows));
  const colCount = Math.min(20, Math.max(1, cols));
  let html = '<table><thead><tr>';
  for (let c = 0; c < colCount; c += 1) {
    html += '<th><p><br></p></th>';
  }
  html += '</tr></thead>';
  if (rowCount > 1) {
    html += '<tbody>';
    for (let r = 1; r < rowCount; r += 1) {
      html += '<tr>';
      for (let c = 0; c < colCount; c += 1) {
        html += '<td><p><br></p></td>';
      }
      html += '</tr>';
    }
    html += '</tbody>';
  }
  html += '</table><p><br></p>';
  return html;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
