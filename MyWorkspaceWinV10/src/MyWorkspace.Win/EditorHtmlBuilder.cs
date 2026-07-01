using Markdig;
using System.Text.RegularExpressions;

namespace MyWorkspace.Win;

internal static class EditorHtmlBuilder
{
    private const string BodyPlaceholder = "/*EDITOR_BODY*/";
    private const string PlaceholderToken = "/*EDITOR_PLACEHOLDER*/";
    private const string DefaultCodeToken = "/*DEFAULT_CODE*/";

    public static string BuildEditablePage(string markdown, MarkdownPipeline pipeline, EditorChromeOptions? chrome = null)
    {
        chrome ??= EditorChromeOptions.CreateCurrent();
        var body = Markdown.ToHtml(markdown, pipeline);
        if (string.IsNullOrWhiteSpace(body))
            body = "<p><br></p>";
        else
        {
            body = InjectHeadingIds(body);
            body = EnhanceEditorBody(body);
        }

        return WrapEditablePage(chrome)
            .Replace(BodyPlaceholder, body)
            .Replace(PlaceholderToken, EscapeCssContent(chrome.Placeholder))
            .Replace(DefaultCodeToken, EscapeJs(Localization.Get(K.DefaultCodeText)));
    }
    private static string InjectHeadingIds(string html)
    {
        var headingIndex = 0;
        return Regex.Replace(
            html,
            "<h([1-6])([^>]*)>",
            m =>
            {
                var level = m.Groups[1].Value;
                var attrs = m.Groups[2].Value;
                headingIndex++;
                attrs = Regex.Replace(attrs, @"\sid\s*=\s*(""[^""]*""|'[^']*')", "", RegexOptions.IgnoreCase);
                return $"<h{level}{attrs} id=\"outline-heading-{headingIndex}\">";
            });
    }

    private static string EnhanceEditorBody(string html)
    {
        html = WrapImagesForEditing(html);
        html = WrapFileLinksForEditing(html);
        return html;
    }

    private static string WrapImagesForEditing(string html) =>
        Regex.Replace(
            html,
            @"<img\b([^>]*?)\/?>",
            match => match.Value.Contains("editor-image-wrap", StringComparison.OrdinalIgnoreCase)
                ? match.Value
                : $"""<span class="editor-image-wrap" contenteditable="false"><img{match.Groups[1].Value}><span class="editor-image-resize-handle" contenteditable="false"></span></span>""",
            RegexOptions.IgnoreCase);

    private static string WrapFileLinksForEditing(string html) =>
        Regex.Replace(
            html,
            @"<a\b(?![^>]*class=[""']editor-file-attachment[""'])([^>]*?\shref=[""'](?<href>[^""']+)[""'][^>]*?)>(?<text>.*?)</a>",
            match =>
            {
                var href = match.Groups["href"].Value;
                if (href.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                    href.StartsWith("https://", StringComparison.OrdinalIgnoreCase) ||
                    href.StartsWith("mailto:", StringComparison.OrdinalIgnoreCase))
                    return match.Value;

                if (!href.Contains("page-asset:", StringComparison.OrdinalIgnoreCase) &&
                    !href.StartsWith("file:", StringComparison.OrdinalIgnoreCase) &&
                    !href.Contains(PageAssetStore.EditorAssetHost, StringComparison.OrdinalIgnoreCase))
                    return match.Value;

                return $"""<a class="editor-file-attachment" contenteditable="false"{match.Groups[1].Value}>{match.Groups["text"].Value}</a>""";
            },
            RegexOptions.IgnoreCase | RegexOptions.Singleline);

    private static string WrapEditablePage(EditorChromeOptions chrome)
    {
        var p = chrome.Palette;
        var bg = ToCss(p.Surface);
        var text = ToCss(p.EditorText);
        var caret = ToCss(p.EditorCaret);
        var placeholder = ToCss(p.EditorPlaceholder);
        var focus = ToCssAlpha(p.EditorFocusRing, 51);
        var codeBg = ToCss(p.EditorCodeBackground);
        var border = ToCss(p.Border);
        var borderLight = ToCss(p.BorderLight);
        var accent = ToCss(p.Accent);
        var muted = ToCss(p.TextSecondary);
        var selection = ToCssAlpha(p.Accent, 51);
        var lang = Localization.Current == AppLanguage.Korean ? "ko" : "en";
        var colorScheme = AppTheme.IsDark ? "dark" : "light";
        var bodyFontSize = (15F * chrome.FontScaleFactor).ToString("0.#", System.Globalization.CultureInfo.InvariantCulture);

        return $$"""
        <!DOCTYPE html>
        <html lang="{{lang}}">
        <head>
          <meta charset="utf-8">
          <meta name="color-scheme" content="{{colorScheme}}">
          <style>
            :root {
              --editor-bg: {{bg}};
              --editor-text: {{text}};
              --editor-caret: {{caret}};
              --editor-placeholder: {{placeholder}};
              --editor-focus: {{focus}};
              --editor-code-bg: {{codeBg}};
              --editor-border: {{border}};
              --editor-border-light: {{borderLight}};
              --editor-accent: {{accent}};
              --editor-muted: {{muted}};
              --editor-selection: {{selection}};
            }
            html, body { height: 100%; margin: 0; background: var(--editor-bg) !important; color: var(--editor-text) !important; }
            html { color-scheme: {{colorScheme}}; background: var(--editor-bg) !important; }
            body {
              font-family: "Segoe UI", "Malgun Gothic", sans-serif;
              font-size: {{bodyFontSize}}px; line-height: 1.75; color: var(--editor-text);
              background: var(--editor-bg) !important; overflow: hidden;
            }
            ::selection { background: var(--editor-selection); }
            #editor::-webkit-scrollbar { width: 10px; }
            #editor::-webkit-scrollbar-thumb {
              background: var(--editor-border); border-radius: 999px; border: 2px solid var(--editor-bg);
            }
            #editor::-webkit-scrollbar-track { background: transparent; }
            #editor {
              height: 100%; box-sizing: border-box;
              padding: 8px 32px 24px 32px; outline: none; overflow-y: auto;
              caret-color: var(--editor-caret);
              background-color: var(--editor-bg) !important; color: var(--editor-text) !important;
            }
            #editor:focus { box-shadow: inset 0 0 0 1px var(--editor-focus); }
            #editor.is-file-drop-target {
              box-shadow: inset 0 0 0 2px var(--editor-accent);
              background-color: color-mix(in srgb, var(--editor-accent) 8%, var(--editor-bg));
            }
            #editor[data-empty="true"]:before {
              content: "{{PlaceholderToken}}";
              color: var(--editor-placeholder); pointer-events: none;
            }
            #editor p, #editor li, #editor td, #editor th, #editor div, #editor span,
            #editor strong, #editor b, #editor em, #editor i {
              color: var(--editor-text) !important;
            }
            #editor p, #editor div, #editor span, #editor li, #editor ul, #editor ol {
              background-color: transparent !important;
            }
            h1,h2,h3,h4,h5,h6 { font-weight: 600; margin: 24px 0 12px; scroll-margin-top: 8px; display: block; width: 100%; box-sizing: border-box; color: var(--editor-text) !important; }
            #editor > :first-child { margin-top: 0; }
            h1 { font-size: 1.8em; border-bottom: none; padding-bottom: 0.3em; }
            h1::after { content: ""; display: block; border-bottom: 1px solid var(--editor-border); margin: 0.3em -32px 0; }
            h2 { font-size: 1.5em; border-bottom: none; padding-bottom: 0.25em; }
            h2::after { content: ""; display: block; border-bottom: 1px solid var(--editor-border-light); margin: 0.25em -32px 0; }
            h3 { font-size: 1.25em; }
            h4 { font-size: 1.1em; }
            h5 { font-size: 1em; }
            h6 { font-size: 0.95em; text-transform: uppercase; letter-spacing: 0.02em; }
            h1 a, h2 a, h3 a, h4 a, h5 a, h6 a { color: var(--editor-accent) !important; }
            p { margin: 0 0 14px; min-height: 1em; }
            strong, b { font-weight: 700; }
            em, i { font-style: italic; }
            s, strike, del { text-decoration: line-through; color: var(--editor-muted) !important; }
            code { background: var(--editor-code-bg); padding: 0.15em 0.4em; border-radius: 4px; font-family: Consolas, monospace; font-size: 0.92em; color: var(--editor-text) !important; }
            pre { background: var(--editor-code-bg); padding: 16px; border-radius: 8px; overflow-x: auto; margin: 0 0 14px; }
            pre code { background: none; padding: 0; }
            blockquote { border-left: 4px solid var(--editor-accent); padding: 8px 16px; color: var(--editor-muted) !important; background: var(--editor-code-bg); margin: 0 0 14px; }
            table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
            th, td { border: 1px solid var(--editor-border); padding: 8px 12px; min-width: 40px; }
            th { background: var(--editor-code-bg); font-weight: 600; }
            ul, ol { margin: 0 0 14px; padding-left: 28px; }
            a { color: var(--editor-accent) !important; text-decoration: underline; }
            #editor img { border-radius: 2px; vertical-align: text-bottom; }
            .editor-image-wrap {
              display: inline-block; position: relative;
              margin: 0 1px; vertical-align: text-bottom; line-height: 1;
            }
            .editor-image-wrap.is-sized { max-width: none; }
            .editor-image-wrap img {
              height: auto; border-radius: 2px;
              border: 1px solid var(--editor-border-light);
              display: inline-block; vertical-align: text-bottom;
            }
            .editor-image-wrap:not(.is-sized) img {
              max-height: 1.25em; width: auto; max-width: none;
            }
            .editor-image-wrap.is-sized img,
            .editor-image-wrap img[style*="width"] {
              max-width: none; max-height: none;
            }
            .editor-image-wrap.is-selected img {
              outline: 2px solid var(--editor-accent); outline-offset: 1px;
            }
            .editor-image-wrap.is-selected:not(.is-dragging) { cursor: grab; }
            .editor-image-resize-handle {
              position: absolute; right: -2px; bottom: -2px; width: 10px; height: 10px;
              background: var(--editor-accent); border: 2px solid var(--editor-bg);
              border-radius: 2px; cursor: nwse-resize; z-index: 5;
              box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
              pointer-events: none; touch-action: none; user-select: none; opacity: 0;
            }
            .editor-image-wrap:hover .editor-image-resize-handle,
            .editor-image-wrap.is-selected .editor-image-resize-handle {
              opacity: 1; pointer-events: auto;
            }
            .editor-image-wrap.is-dragging {
              opacity: 0.75; cursor: grabbing !important; z-index: 10000;
            }
            #editor.is-image-move-target {
              box-shadow: inset 0 0 0 1px var(--editor-accent);
            }
            .editor-image-drop-caret {
              position: fixed; width: 2px; background: var(--editor-caret);
              pointer-events: none; z-index: 9999; display: none;
              border-radius: 1px;
              animation: editor-drop-caret-blink 1s step-end infinite;
            }
            @keyframes editor-drop-caret-blink {
              50% { opacity: 0; }
            }
            .editor-file-attachment {
              display: inline-flex; align-items: center; gap: 6px;
              padding: 6px 10px; margin: 0 4px 14px 0;
              border: 1px solid var(--editor-border); border-radius: 6px;
              background: var(--editor-code-bg); color: var(--editor-text) !important;
              text-decoration: none !important; font-size: 0.95em;
            }
            .editor-file-attachment:before {
              content: "📎"; font-size: 1em; line-height: 1;
            }
            hr { border: none; border-top: 1px solid var(--editor-border); margin: 20px 0; }
          </style>
        </head>
        <body>
          <div id="editor" contenteditable="true" spellcheck="true" data-empty="true">{{BodyPlaceholder}}</div>
          <script>
            const editor = document.getElementById('editor');
            const defaultCodeText = '{{DefaultCodeToken}}';
            const defaultTheme = {
              bg: '{{bg}}',
              text: '{{text}}',
              caret: '{{caret}}',
              placeholder: '{{placeholder}}',
              focus: '{{focus}}',
              codeBg: '{{codeBg}}',
              border: '{{border}}',
              borderLight: '{{borderLight}}',
              accent: '{{accent}}',
              muted: '{{muted}}',
              selection: '{{selection}}',
              colorScheme: '{{colorScheme}}'
            };

            function setThemeVars(theme) {
              const root = document.documentElement;
              root.style.setProperty('--editor-bg', theme.bg);
              root.style.setProperty('--editor-text', theme.text);
              root.style.setProperty('--editor-caret', theme.caret);
              root.style.setProperty('--editor-placeholder', theme.placeholder);
              root.style.setProperty('--editor-focus', theme.focus);
              root.style.setProperty('--editor-code-bg', theme.codeBg);
              root.style.setProperty('--editor-border', theme.border);
              root.style.setProperty('--editor-border-light', theme.borderLight);
              root.style.setProperty('--editor-accent', theme.accent);
              root.style.setProperty('--editor-muted', theme.muted);
              root.style.setProperty('--editor-selection', theme.selection);
              root.style.colorScheme = theme.colorScheme;
              const meta = document.querySelector('meta[name="color-scheme"]');
              if (meta) meta.content = theme.colorScheme;
              document.body.style.background = theme.bg;
              document.body.style.color = theme.text;
              editor.style.backgroundColor = theme.bg;
              editor.style.color = theme.text;
              editor.style.caretColor = theme.caret;
            }

            function clearStaleInlineColors() {
              editor.querySelectorAll('*').forEach(el => {
                if (el.tagName === 'A') return;
                el.style.removeProperty('color');
                el.removeAttribute('bgcolor');
                if (el.tagName !== 'CODE' && el.tagName !== 'PRE' && el.tagName !== 'BLOCKQUOTE' && el.tagName !== 'TH')
                  el.style.removeProperty('background-color');
              });
            }

            function notifyChanged() { window.chrome.webview.postMessage('changed'); }
            function notifyCaret() { window.chrome.webview.postMessage('caret'); }

            let caretNotifyTimer = null;
            function notifyCaretDebounced() {
              if (caretNotifyTimer !== null) return;
              caretNotifyTimer = window.setTimeout(() => {
                caretNotifyTimer = null;
                notifyCaret();
              }, 200);
            }

            function escapeHtml(text) {
              return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            }

            const ZWSP = '\u200B';
            let imageMoveSession = null;
            let suppressNextImageClick = false;
            let caretNormalizeTimer = null;
            let imageDropCaret = null;

            function ensureImageDropCaret() {
              if (imageDropCaret) return imageDropCaret;
              imageDropCaret = document.createElement('div');
              imageDropCaret.className = 'editor-image-drop-caret';
              imageDropCaret.setAttribute('aria-hidden', 'true');
              document.body.appendChild(imageDropCaret);
              return imageDropCaret;
            }

            function hideImageDropCaret() {
              if (imageDropCaret) imageDropCaret.style.display = 'none';
              if (imageMoveSession) imageMoveSession.dropRange = null;
            }

            function getCaretRectFromRange(range) {
              const rects = range.getClientRects();
              if (rects.length > 0) return rects[0];

              const marker = document.createElement('span');
              marker.textContent = ZWSP;
              marker.style.display = 'inline-block';
              marker.style.width = '0';
              marker.style.overflow = 'hidden';
              range.insertNode(marker);
              const rect = marker.getBoundingClientRect();
              marker.remove();
              return rect;
            }

            function updateImageDropCaret(clientX, clientY) {
              const marker = ensureImageDropCaret();
              const range = document.caretRangeFromPoint(clientX, clientY);
              if (!range || !editor.contains(range.startContainer)) {
                marker.style.display = 'none';
                if (imageMoveSession) imageMoveSession.dropRange = null;
                return;
              }

              range.collapse(true);
              if (imageMoveSession) imageMoveSession.dropRange = range.cloneRange();

              const rect = getCaretRectFromRange(range);
              const lineHeight = parseFloat(window.getComputedStyle(editor).lineHeight) || 20;
              const height = Math.max(rect.height || 0, lineHeight, 14);
              marker.style.display = 'block';
              marker.style.left = Math.round(rect.left) + 'px';
              marker.style.top = Math.round(rect.top) + 'px';
              marker.style.height = Math.round(height) + 'px';
            }

            function placeCaretBefore(node) {
              editor.focus();
              const range = document.createRange();
              if (node.previousSibling && node.previousSibling.nodeType === Node.TEXT_NODE) {
                const textNode = node.previousSibling;
                range.setStart(textNode, textNode.textContent.length);
              } else {
                range.setStartBefore(node);
              }
              range.collapse(true);
              const sel = window.getSelection();
              sel.removeAllRanges();
              sel.addRange(range);
            }

            function placeCaretAfter(node) {
              editor.focus();
              const range = document.createRange();
              if (node.nextSibling && node.nextSibling.nodeType === Node.TEXT_NODE) {
                range.setStart(node.nextSibling, 0);
              } else {
                range.setStartAfter(node);
              }
              range.collapse(true);
              const sel = window.getSelection();
              sel.removeAllRanges();
              sel.addRange(range);
            }

            function ensureCaretAnchors(wrap) {
              const parent = wrap.parentNode;
              if (!parent) return;

              const prev = wrap.previousSibling;
              if (!prev || prev.nodeType !== Node.TEXT_NODE) {
                parent.insertBefore(document.createTextNode(ZWSP), wrap);
              } else if (!prev.textContent.includes(ZWSP)) {
                prev.textContent += ZWSP;
              }

              const next = wrap.nextSibling;
              if (!next || next.nodeType !== Node.TEXT_NODE) {
                if (next)
                  parent.insertBefore(document.createTextNode(ZWSP), next);
                else
                  parent.appendChild(document.createTextNode(ZWSP));
              } else if (!next.textContent.includes(ZWSP)) {
                next.textContent = ZWSP + next.textContent;
              }
            }

            function scheduleCaretAnchorNormalize() {
              if (caretNormalizeTimer !== null) return;
              caretNormalizeTimer = window.setTimeout(() => {
                caretNormalizeTimer = null;
                editor.querySelectorAll('.editor-image-wrap').forEach(ensureCaretAnchors);
              }, 50);
            }

            function updateEmptyState() {
              const text = editor.innerText.replace(/\u00a0/g, ' ').trim();
              const empty = text.length === 0;
              editor.dataset.empty = empty ? 'true' : 'false';
              if (empty && editor.innerHTML.replace(/<[^>]+>/g, '').trim() === '') {
                if (!editor.querySelector('p, h1, h2, h3, h4, h5, h6, ul, ol, table, blockquote, pre')) {
                  editor.innerHTML = '<p><br></p>';
                }
              }
            }

            function ensureParagraph() {
              if (!editor.querySelector('p, h1, h2, h3, h4, h5, h6, ul, ol, table, blockquote, pre')) {
                editor.innerHTML = '<p><br></p>';
              }
            }

            function placeCaretAtEnd(el) {
              el.focus();
              const range = document.createRange();
              range.selectNodeContents(el);
              range.collapse(false);
              const sel = window.getSelection();
              sel.removeAllRanges();
              sel.addRange(range);
            }

            editor.addEventListener('input', () => {
              updateEmptyState();
              notifyChanged();
              scheduleCaretAnchorNormalize();
            });
            editor.addEventListener('keyup', (e) => {
              if (e.key === 'ContextMenu' || e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
              notifyCaretDebounced();
            });
            editor.addEventListener('click', (e) => {
              if (suppressNextImageClick) {
                suppressNextImageClick = false;
                return;
              }
              if (e.button === 0) {
                if (!e.target.closest('.editor-image-wrap'))
                  editor.querySelectorAll('.editor-image-wrap.is-selected').forEach(w => w.classList.remove('is-selected'));
                notifyCaretDebounced();
              }
            });
            editor.addEventListener('focus', ensureParagraph);
            editor.addEventListener('compositionend', () => { updateEmptyState(); notifyChanged(); });
            editor.addEventListener('contextmenu', (e) => { e.preventDefault(); });

            editor.addEventListener('keydown', (e) => {
              if (e.key === 'Escape' && imageMoveSession) {
                const session = imageMoveSession;
                const wrap = session.wrap;
                if (session.dragging && session.savedParent) {
                  wrap.remove();
                  if (session.savedNext && session.savedNext.parentNode === session.savedParent)
                    session.savedParent.insertBefore(wrap, session.savedNext);
                  else
                    session.savedParent.appendChild(wrap);
                }
                clearImageMoveStyles(wrap);
                editor.classList.remove('is-image-move-target');
                hideImageDropCaret();
                imageMoveSession = null;
                wrap.classList.add('is-selected');
                e.preventDefault();
                return;
              }
              const selectedImage = editor.querySelector('.editor-image-wrap.is-selected');
              if (selectedImage && (e.key === 'Backspace' || e.key === 'Delete')) {
                e.preventDefault();
                selectedImage.remove();
                updateEmptyState();
                notifyChanged();
                return;
              }
              if (selectedImage && e.key === 'ArrowLeft') {
                e.preventDefault();
                selectedImage.classList.remove('is-selected');
                placeCaretBefore(selectedImage);
                return;
              }
              if (selectedImage && e.key === 'ArrowRight') {
                e.preventDefault();
                selectedImage.classList.remove('is-selected');
                placeCaretAfter(selectedImage);
                return;
              }
              if (selectedImage && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                selectedImage.classList.remove('is-selected');
              }
              if (e.ctrlKey || e.metaKey) {
                if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); window.editorApi.undo(); return; }
                if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); window.editorApi.redo(); return; }
                if (e.key === 'b') { e.preventDefault(); window.editorApi.applyFormat('bold'); return; }
                if (e.key === 'i') { e.preventDefault(); window.editorApi.applyFormat('italic'); return; }
                if (e.key === 'u') { e.preventDefault(); window.editorApi.applyFormat('underline'); return; }
              }
            });

            editor.addEventListener('paste', (e) => {
              e.preventDefault();
              const text = (e.clipboardData || window.clipboardData).getData('text/plain');
              document.execCommand('insertText', false, text);
              updateEmptyState();
              notifyChanged();
              scheduleCaretAnchorNormalize();
            });

            function beginImageMoveTracking(wrap, e) {
              imageMoveSession = {
                wrap,
                startX: e.clientX,
                startY: e.clientY,
                dragging: false,
                savedParent: null,
                savedNext: null,
                offsetX: 0,
                offsetY: 0,
                dropRange: null
              };
            }

            function clearImageMoveStyles(wrap) {
              wrap.classList.remove('is-dragging');
              wrap.style.position = '';
              wrap.style.left = '';
              wrap.style.top = '';
              wrap.style.margin = '';
              wrap.style.zIndex = '';
              wrap.style.pointerEvents = '';
            }

            function finishImageMove(e) {
              const session = imageMoveSession;
              imageMoveSession = null;
              editor.classList.remove('is-image-move-target');
              hideImageDropCaret();
              if (!session) return;

              const wrap = session.wrap;
              clearImageMoveStyles(wrap);

              if (!session.dragging) return;

              suppressNextImageClick = true;
              wrap.remove();

              let range = session.dropRange;
              if (!range) {
                const pointRange = document.caretRangeFromPoint(e.clientX, e.clientY);
                if (pointRange && editor.contains(pointRange.startContainer))
                  range = pointRange;
              }
              if (range && editor.contains(range.startContainer)) {
                range.collapse(true);
                range.insertNode(wrap);
              } else if (session.savedParent) {
                if (session.savedNext && session.savedNext.parentNode === session.savedParent)
                  session.savedParent.insertBefore(wrap, session.savedNext);
                else
                  session.savedParent.appendChild(wrap);
              }

              ensureCaretAnchors(wrap);
              wrap.classList.add('is-selected');
              updateEmptyState();
              notifyChanged();
            }

            document.addEventListener('mousemove', (e) => {
              const session = imageMoveSession;
              if (!session) return;

              const wrap = session.wrap;
              const dx = e.clientX - session.startX;
              const dy = e.clientY - session.startY;

              if (!session.dragging) {
                if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
                session.dragging = true;
                session.savedParent = wrap.parentNode;
                session.savedNext = wrap.nextSibling;
                const rect = wrap.getBoundingClientRect();
                session.offsetX = e.clientX - rect.left;
                session.offsetY = e.clientY - rect.top;
                wrap.classList.add('is-dragging');
                wrap.style.position = 'fixed';
                wrap.style.left = rect.left + 'px';
                wrap.style.top = rect.top + 'px';
                wrap.style.margin = '0';
                wrap.style.zIndex = '10000';
                wrap.style.pointerEvents = 'none';
                document.body.appendChild(wrap);
                editor.classList.add('is-image-move-target');
              }

              wrap.style.left = (e.clientX - session.offsetX) + 'px';
              wrap.style.top = (e.clientY - session.offsetY) + 'px';

              if (session.dragging)
                updateImageDropCaret(e.clientX, e.clientY);
            });

            document.addEventListener('mouseup', (e) => {
              if (!imageMoveSession) return;
              finishImageMove(e);
            });

            function applyImageSizeState(wrap, img) {
              if (img.style.width || img.getAttribute('width')) {
                wrap.classList.add('is-sized');
                img.style.maxWidth = 'none';
              }
            }

            function setupImageResize(wrap, img, handle) {
              wrap.addEventListener('mousedown', (e) => {
                if (e.button !== 0 || e.target === handle) return;
                const rect = wrap.getBoundingClientRect();
                const localX = e.clientX - rect.left;
                const edge = Math.min(10, rect.width * 0.15);
                if (localX <= edge) {
                  e.preventDefault();
                  wrap.classList.remove('is-selected');
                  placeCaretBefore(wrap);
                  return;
                }
                if (localX >= rect.width - edge) {
                  e.preventDefault();
                  wrap.classList.remove('is-selected');
                  placeCaretAfter(wrap);
                  return;
                }
                editor.querySelectorAll('.editor-image-wrap.is-selected').forEach(w => w.classList.remove('is-selected'));
                wrap.classList.add('is-selected');
                beginImageMoveTracking(wrap, e);
                e.preventDefault();
              });

              handle.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                imageMoveSession = null;
                hideImageDropCaret();
                e.preventDefault();
                e.stopPropagation();
                wrap.classList.add('is-selected');
                const startX = e.clientX;
                const rectWidth = img.getBoundingClientRect().width;
                const startWidth = rectWidth > 0 ? rectWidth : (img.naturalWidth || img.offsetWidth || 200);
                img.style.maxWidth = 'none';

                function onMove(ev) {
                  const width = Math.max(40, Math.round(startWidth + (ev.clientX - startX)));
                  img.style.width = width + 'px';
                  img.style.height = 'auto';
                  img.style.maxWidth = 'none';
                  wrap.classList.add('is-sized');
                  wrap.style.width = width + 'px';
                }

                function onUp() {
                  document.removeEventListener('mousemove', onMove);
                  document.removeEventListener('mouseup', onUp);
                  notifyChanged();
                }

                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
              });
            }

            function ensureImageWrapReady(wrap) {
              if (wrap.dataset.resizeReady === '1') return;
              const img = wrap.querySelector('img');
              if (!img) return;
              let handle = wrap.querySelector('.editor-image-resize-handle');
              if (!handle) {
                handle = document.createElement('span');
                handle.className = 'editor-image-resize-handle';
                handle.contentEditable = 'false';
                wrap.appendChild(handle);
              }
              if (wrap.contentEditable !== 'false') wrap.contentEditable = 'false';
              applyImageSizeState(wrap, img);
              setupImageResize(wrap, img, handle);
              ensureCaretAnchors(wrap);
              wrap.dataset.resizeReady = '1';
              if (!img.complete) {
                img.addEventListener('load', () => applyImageSizeState(wrap, img), { once: true });
              }
            }

            function wrapImage(img) {
              if (!img || img.closest('.editor-image-wrap')) return;
              const wrap = document.createElement('span');
              wrap.className = 'editor-image-wrap';
              wrap.contentEditable = 'false';
              img.parentNode.insertBefore(wrap, img);
              wrap.appendChild(img);
              const handle = document.createElement('span');
              handle.className = 'editor-image-resize-handle';
              handle.contentEditable = 'false';
              wrap.appendChild(handle);
              ensureImageWrapReady(wrap);
            }

            function upgradeEditorBlocks() {
              editor.querySelectorAll('img').forEach(img => wrapImage(img));
              editor.querySelectorAll('.editor-image-wrap').forEach(wrap => ensureImageWrapReady(wrap));
              editor.querySelectorAll('a[href]').forEach(link => {
                if (link.classList.contains('editor-file-attachment')) return;
                if (link.querySelector('img')) return;
                const href = link.getAttribute('href') || '';
                if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:'))
                  return;
                if (!href.includes('page-asset:') && !href.startsWith('file:') && !href.includes('page-assets.myworkspace'))
                  return;
                link.classList.add('editor-file-attachment');
                link.contentEditable = 'false';
              });
            }

            window.editorApi = {
              focus() {
                ensureParagraph();
                editor.focus();
              },
              applyFormat(command) {
                editor.focus();
                document.execCommand(command, false, null);
                updateEmptyState();
                notifyChanged();
              },
              undo() {
                editor.focus();
                document.execCommand('undo', false, null);
                updateEmptyState();
                notifyChanged();
              },
              redo() {
                editor.focus();
                document.execCommand('redo', false, null);
                updateEmptyState();
                notifyChanged();
              },
              applyHeading(level) {
                editor.focus();
                document.execCommand('formatBlock', false, '<h' + level + '>');
                updateEmptyState();
                notifyChanged();
              },
              applyBlockquote() {
                editor.focus();
                document.execCommand('formatBlock', false, '<blockquote>');
                updateEmptyState();
                notifyChanged();
              },
              applyParagraph() {
                editor.focus();
                document.execCommand('formatBlock', false, '<p>');
                updateEmptyState();
                notifyChanged();
              },
              wrapInlineCode() {
                editor.focus();
                const sel = window.getSelection();
                const text = sel && sel.toString() ? sel.toString() : defaultCodeText;
                document.execCommand('insertHTML', false, '<code>' + escapeHtml(text) + '</code>');
                updateEmptyState();
                notifyChanged();
              },
              insertHtml(html) {
                editor.focus();
                document.execCommand('insertHTML', false, html);
                upgradeEditorBlocks();
                updateEmptyState();
                notifyChanged();
              },
              insertImage(src, alt) {
                editor.focus();
                ensureParagraph();
                const safeSrc = escapeHtml(src);
                const safeAlt = escapeHtml(alt || '');
                document.execCommand('insertHTML', false, '&#8203;<span class="editor-image-wrap" contenteditable="false"><img src="' + safeSrc + '" alt="' + safeAlt + '"><span class="editor-image-resize-handle" contenteditable="false"></span></span>&#8203;');
                upgradeEditorBlocks();
                const wraps = editor.querySelectorAll('.editor-image-wrap');
                if (wraps.length > 0) {
                  const lastWrap = wraps[wraps.length - 1];
                  ensureCaretAnchors(lastWrap);
                  placeCaretAfter(lastWrap);
                }
                updateEmptyState();
                notifyChanged();
              },
              insertFileAttachment(href, fileName) {
                editor.focus();
                ensureParagraph();
                const safeHref = escapeHtml(href);
                const safeName = escapeHtml(fileName || href);
                document.execCommand('insertHTML', false, '&#8203;<a class="editor-file-attachment" href="' + safeHref + '" contenteditable="false">' + safeName + '</a>&#8203;');
                upgradeEditorBlocks();
                updateEmptyState();
                notifyChanged();
              },
              createLink(text, url) {
                editor.focus();
                if (!url) return;
                const label = (text || '').trim() || url;
                document.execCommand('insertHTML', false, '<a href="' + escapeHtml(url) + '">' + escapeHtml(label) + '</a>');
                updateEmptyState();
                notifyChanged();
              },
              getSelectedText() {
                const sel = window.getSelection();
                return sel ? sel.toString() : '';
              },
              focusCaretAtPoint(x, y) {
                editor.focus();
                const range = document.caretRangeFromPoint(x, y);
                if (!range || !editor.contains(range.startContainer)) return false;
                range.collapse(true);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                return true;
              },
              setFileDropHighlight(active) {
                editor.classList.toggle('is-file-drop-target', !!active);
              },
              scrollToHeading(id) {
                document.getElementById(id)?.scrollIntoView({ behavior: 'auto', block: 'start' });
              },
              getHeadings() {
                const hs = editor.querySelectorAll('h1,h2,h3,h4,h5,h6');
                return JSON.stringify(Array.from(hs).map((h, i) => {
                  const id = 'outline-heading-' + (i + 1);
                  h.id = id;
                  return {
                    level: parseInt(h.tagName.substring(1), 10),
                    text: h.innerText.trim(),
                    id
                  };
                }));
              },
              getHtml() { return editor.innerHTML; },
              getActiveHeadingId() {
                const sel = window.getSelection();
                if (!sel || sel.rangeCount === 0) return '';
                let node = sel.anchorNode;
                while (node && node !== editor) {
                  if (node.nodeType === 1 && /^H[1-6]$/.test(node.tagName)) return node.id || '';
                  node = node.parentNode;
                }
                const hs = editor.querySelectorAll('h1,h2,h3,h4,h5,h6');
                if (hs.length === 0) return '';
                const rect = editor.getBoundingClientRect();
                const mid = rect.top + 80;
                let last = '';
                for (const h of hs) {
                  if (h.getBoundingClientRect().top <= mid) last = h.id || '';
                  else break;
                }
                return last;
              },
              setFirstHeadingTitle(title) {
                const text = (title || '').trim();
                let h1 = editor.querySelector('h1');
                if (!h1) {
                  h1 = document.createElement('h1');
                  if (text) h1.textContent = text;
                  else h1.innerHTML = '<br>';
                  if (editor.firstChild)
                    editor.insertBefore(h1, editor.firstChild);
                  else
                    editor.appendChild(h1);
                } else if (text) {
                  h1.textContent = text;
                } else {
                  h1.innerHTML = '<br>';
                }
                updateEmptyState();
                notifyChanged();
              },
              applyThemeChrome(overrides) {
                const theme = Object.assign({}, defaultTheme, overrides || {});
                setThemeVars(theme);
                clearStaleInlineColors();
              }
            };

            setThemeVars(defaultTheme);
            clearStaleInlineColors();
            upgradeEditorBlocks();
            updateEmptyState();
            window.addEventListener('load', () => {
              clearStaleInlineColors();
              upgradeEditorBlocks();
              placeCaretAtEnd(editor);
            });
          </script>
        </body>
        </html>
        """;
    }

    private static string ToCss(Color color) =>
        $"#{color.R:X2}{color.G:X2}{color.B:X2}";

    private static string ToCssAlpha(Color color, int alpha) =>
        $"#{color.R:X2}{color.G:X2}{color.B:X2}{alpha:X2}";

    private static string EscapeCssContent(string value) =>
        value.Replace("\\", "\\\\").Replace("\"", "\\\"");

    private static string EscapeJs(string value) =>
        value.Replace("\\", "\\\\").Replace("'", "\\'").Replace("\r", "").Replace("\n", "\\n");
}