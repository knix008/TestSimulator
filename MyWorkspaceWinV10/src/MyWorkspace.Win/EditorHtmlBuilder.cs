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
            match =>
            {
                if (match.Value.Contains("editor-image-wrap", StringComparison.OrdinalIgnoreCase))
                    return match.Value;

                var attrs = match.Groups[1].Value;
                if (!TryGetImageWidthPx(attrs, out var widthPx))
                    return $"""<span class="editor-image-wrap" contenteditable="false"><img {attrs.Trim()}><span class="editor-image-resize-handle" contenteditable="false"></span></span>""";

                attrs = EnsureImgAttrsHaveDisplayWidth(attrs, widthPx);
                return $"""<span class="editor-image-wrap is-sized" contenteditable="false" data-editor-width="{widthPx}" style="width: {widthPx}px;"><img{attrs}><span class="editor-image-resize-handle" contenteditable="false"></span></span>""";
            },
            RegexOptions.IgnoreCase);

    private static bool TryGetImageWidthPx(string attrs, out int widthPx)
    {
        widthPx = 0;

        var dataWidthMatch = Regex.Match(attrs, """\bdata-editor-width\s*=\s*("(?<w>\d+)"|'(?<w>\d+)')""", RegexOptions.IgnoreCase);
        if (dataWidthMatch.Success && int.TryParse(dataWidthMatch.Groups["w"].Value, out widthPx) && widthPx > 0)
            return true;

        var styleMatch = Regex.Match(attrs, @"\bwidth\s*:\s*(?<w>\d+)\s*px", RegexOptions.IgnoreCase);
        if (styleMatch.Success && int.TryParse(styleMatch.Groups["w"].Value, out widthPx) && widthPx > 0)
            return true;

        var widthMatch = Regex.Match(attrs, """\bwidth\s*=\s*("(?<w>\d+)"|'(?<w>\d+)')""", RegexOptions.IgnoreCase);
        if (widthMatch.Success && int.TryParse(widthMatch.Groups["w"].Value, out widthPx) && widthPx > 0)
            return true;

        widthPx = 0;
        return false;
    }

    private static string EnsureImgAttrsHaveDisplayWidth(string attrs, int widthPx)
    {
        var srcMatch = Regex.Match(attrs, """\bsrc\s*=\s*("(?<v>[^"]*)"|'(?<v>[^']*)')""", RegexOptions.IgnoreCase);
        if (!srcMatch.Success)
            return attrs;

        var src = srcMatch.Groups["v"].Value;
        var altMatch = Regex.Match(attrs, """\balt\s*=\s*("(?<v>[^"]*)"|'(?<v>[^']*)')""", RegexOptions.IgnoreCase);
        var alt = altMatch.Success ? altMatch.Groups["v"].Value : string.Empty;
        var altAttr = alt.Length > 0
            ? " alt=\"" + System.Net.WebUtility.HtmlEncode(alt) + "\""
            : string.Empty;
        return " src=\"" + System.Net.WebUtility.HtmlEncode(src) + "\"" + altAttr
            + " data-editor-width=\"" + widthPx + "\""
            + " style=\"width: 100%; height: auto; max-width: none; display: block;\"";
    }

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
        var bg = ToCss(p.Sidebar);
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
              --editor-font-size: {{bodyFontSize}}px;
            }
            html, body { height: 100%; margin: 0; background: var(--editor-bg) !important; color: var(--editor-text) !important; }
            html { color-scheme: {{colorScheme}}; background: var(--editor-bg) !important; }
            body {
              font-family: "Segoe UI", "Malgun Gothic", sans-serif;
              font-size: var(--editor-font-size, {{bodyFontSize}}px); line-height: 1.75; color: var(--editor-text);
              background: var(--editor-bg) !important; overflow: hidden;
            }
            ::selection { background: var(--editor-selection); }
            #editor::-webkit-scrollbar { width: 16px; cursor: default; }
            #editor::-webkit-scrollbar-track { background: transparent; cursor: default; }
            #editor::-webkit-scrollbar-thumb {
              background: var(--editor-border); border-radius: 999px; border: 3px solid var(--editor-bg);
              cursor: default;
            }
            #editor::-webkit-scrollbar-thumb:hover { cursor: default; }
            #editor::-webkit-scrollbar-thumb:active { cursor: default; }
            #editor {
              height: 100%; box-sizing: border-box;
              padding: 8px 32px 24px 32px; outline: none; overflow-y: auto;
              caret-color: var(--editor-caret);
              background-color: var(--editor-bg) !important; color: var(--editor-text) !important;
            }
            #editor:focus { outline: none; box-shadow: none; }
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
            #editor a[href] { cursor: pointer; }
            #editor img { border-radius: 2px; }
            .editor-image-wrap {
              display: inline-block; position: relative;
              vertical-align: baseline; max-width: 100%;
              margin: 0 2px; line-height: 0;
              cursor: pointer;
            }
            .editor-image-wrap.is-sized,
            .editor-image-wrap[data-editor-width] {
              max-width: none;
              overflow: hidden;
            }
            .editor-image-wrap.is-sized > img,
            .editor-image-wrap[data-editor-width] > img {
              display: block;
              width: 100% !important;
              height: auto !important;
              max-width: none !important;
              max-height: none !important;
              min-width: 0 !important;
            }
            .editor-image-wrap.is-sized > img[width],
            .editor-image-wrap.is-sized > img[height],
            .editor-image-wrap[data-editor-width] > img[width],
            .editor-image-wrap[data-editor-width] > img[height] {
              width: 100% !important;
              height: auto !important;
            }
            .editor-image-wrap img {
              height: auto; border-radius: 2px;
              border: 1px solid var(--editor-border-light);
              display: inline-block; vertical-align: baseline;
              max-width: 100%;
              cursor: pointer;
            }
            .editor-image-wrap:not(.is-sized) img:not([width]) {
              width: auto; height: auto;
              max-width: 100%; max-height: none;
            }
            .editor-image-wrap.is-sized img,
            .editor-image-wrap img[data-editor-width],
            .editor-image-wrap img[width],
            .editor-image-wrap img[style*="width"] {
              max-width: none; max-height: none;
            }
            p.editor-image-block {
              margin: 0 0 14px;
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
              cursor: pointer;
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
              colorScheme: '{{colorScheme}}',
              fontSizePx: '{{bodyFontSize}}'
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
              if (theme.fontSizePx)
                root.style.setProperty('--editor-font-size', theme.fontSizePx + 'px');
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
            function notifyOpen(href) {
              if (!href) return;
              window.chrome.webview.postMessage(JSON.stringify({ type: 'open', href: href }));
            }
            function isOpenModifier(e) {
              return !!(e && (e.ctrlKey || e.metaKey));
            }

            function tryOpenImageFromTarget(target) {
              const wrap = target.closest('.editor-image-wrap');
              if (!wrap || !editor.contains(wrap)) return false;
              const img = wrap.querySelector('img');
              const src = img ? (img.getAttribute('src') || img.src) : '';
              if (!src) return false;
              notifyOpen(src);
              return true;
            }

            function tryOpenLinkFromTarget(target) {
              const link = target.closest('a[href]');
              if (!link || !editor.contains(link)) return false;
              const href = link.getAttribute('href') || link.href;
              if (!href) return false;
              notifyOpen(href);
              return true;
            }

            let caretNotifyTimer = null;
            function notifyCaretDebounced() {
              if (caretNotifyTimer !== null) return;
              caretNotifyTimer = window.setTimeout(() => {
                caretNotifyTimer = null;
                notifyCaret();
              }, 200);
            }

            const editorScrollbarWidth = 16;

            function editorHasVerticalScrollbar() {
              return editor.scrollHeight > editor.clientHeight + 1;
            }

            function isOverEditorScrollbar(clientX, clientY) {
              if (!editorHasVerticalScrollbar()) return false;
              const rect = editor.getBoundingClientRect();
              return clientX >= rect.right - editorScrollbarWidth
                && clientX <= rect.right
                && clientY >= rect.top
                && clientY <= rect.bottom;
            }

            let editorScrollbarCursorActive = false;

            function updateEditorScrollbarCursor(e) {
              if (isOverEditorScrollbar(e.clientX, e.clientY)) {
                if (!editorScrollbarCursorActive) {
                  editor.style.cursor = 'default';
                  editorScrollbarCursorActive = true;
                }
                return;
              }

              if (editorScrollbarCursorActive) {
                editor.style.removeProperty('cursor');
                editorScrollbarCursorActive = false;
              }
            }

            function resetEditorScrollbarCursor() {
              if (!editorScrollbarCursorActive) return;
              editor.style.removeProperty('cursor');
              editorScrollbarCursorActive = false;
            }

            editor.addEventListener('mousemove', updateEditorScrollbarCursor);
            editor.addEventListener('mouseleave', resetEditorScrollbarCursor);
            editor.addEventListener('mousedown', (e) => {
              if (e.button !== 0 || !isOverEditorScrollbar(e.clientX, e.clientY)) return;
              editor.style.cursor = 'default';
              function onUp() {
                document.removeEventListener('mouseup', onUp);
                resetEditorScrollbarCursor();
              }
              document.addEventListener('mouseup', onUp);
            });

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

            let fileDropDepth = 0;

            function isExternalFileDrag(e) {
              const types = e.dataTransfer?.types;
              if (!types) return false;
              return Array.from(types).includes('Files');
            }

            function caretRangeFromClientPoint(x, y) {
              if (document.caretRangeFromPoint)
                return document.caretRangeFromPoint(x, y);
              if (document.caretPositionFromPoint) {
                const pos = document.caretPositionFromPoint(x, y);
                if (!pos) return null;
                const range = document.createRange();
                range.setStart(pos.offsetNode, pos.offset);
                range.collapse(true);
                return range;
              }
              return null;
            }

            function focusCaretAtClientPoint(x, y) {
              const range = caretRangeFromClientPoint(x, y);
              if (!range || !editor.contains(range.startContainer)) return false;
              range.collapse(true);
              const sel = window.getSelection();
              if (!sel) return false;
              sel.removeAllRanges();
              sel.addRange(range);
              return true;
            }

            function postFileDropMessage(files, clientX, clientY) {
              if (!files || files.length === 0) return;
              const payload = JSON.stringify({
                type: 'file-drop',
                x: Math.round(clientX),
                y: Math.round(clientY)
              });
              const fileArray = Array.from(files);
              const webview = window.chrome?.webview;
              if (webview?.postMessageWithAdditionalObjects && fileArray.length > 0) {
                webview.postMessageWithAdditionalObjects(payload, ...fileArray);
                return;
              }
              if (webview?.postMessage)
                webview.postMessage(payload);
            }

            function handleExternalFileDragOver(e) {
              if (!isExternalFileDrag(e)) return;
              e.preventDefault();
              if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
              editor.classList.add('is-file-drop-target');
              focusCaretAtClientPoint(e.clientX, e.clientY);
            }

            function handleExternalFileDrop(e) {
              if (!isExternalFileDrag(e)) return;
              e.preventDefault();
              e.stopPropagation();
              fileDropDepth = 0;
              editor.classList.remove('is-file-drop-target');
              focusCaretAtClientPoint(e.clientX, e.clientY);
              postFileDropMessage(e.dataTransfer?.files, e.clientX, e.clientY);
            }

            editor.addEventListener('dragenter', (e) => {
              if (!isExternalFileDrag(e)) return;
              e.preventDefault();
              fileDropDepth++;
              editor.classList.add('is-file-drop-target');
            });

            editor.addEventListener('dragleave', (e) => {
              if (!isExternalFileDrag(e)) return;
              fileDropDepth = Math.max(0, fileDropDepth - 1);
              if (fileDropDepth === 0)
                editor.classList.remove('is-file-drop-target');
            });

            editor.addEventListener('dragover', handleExternalFileDragOver);
            document.body.addEventListener('dragover', handleExternalFileDragOver);

            editor.addEventListener('drop', handleExternalFileDrop);
            document.body.addEventListener('drop', handleExternalFileDrop);

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
              if (e.button === 0 && isOpenModifier(e)) {
                if (tryOpenLinkFromTarget(e.target)) {
                  e.preventDefault();
                  e.stopPropagation();
                  return;
                }
                if (tryOpenImageFromTarget(e.target)) {
                  e.preventDefault();
                  e.stopPropagation();
                  return;
                }
              }
              if (e.button === 0) {
                if (!e.target.closest('.editor-image-wrap'))
                  editor.querySelectorAll('.editor-image-wrap.is-selected').forEach(w => w.classList.remove('is-selected'));
                notifyCaretDebounced();
              }
            });
            editor.addEventListener('dblclick', (e) => {
              if (imageMoveSession) return;
              if (tryOpenLinkFromTarget(e.target)) {
                e.preventDefault();
                e.stopPropagation();
                return;
              }
              const wrap = e.target.closest('.editor-image-wrap');
              if (!wrap || !editor.contains(wrap)) return;
              e.preventDefault();
              e.stopPropagation();
              tryOpenImageFromTarget(e.target);
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
              const sel = window.getSelection();
              const hasTextSelection = sel && !sel.isCollapsed &&
                sel.rangeCount > 0 && editor.contains(sel.anchorNode);
              if (selectedImage && !hasTextSelection && (e.key === 'Backspace' || e.key === 'Delete')) {
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
              const clipboard = e.clipboardData || window.clipboardData;
              const html = clipboard ? clipboard.getData('text/html') : '';
              const text = clipboard ? clipboard.getData('text/plain') : '';

              if (html && (html.includes('editor-image-wrap') || /<img\b/i.test(html))) {
                e.preventDefault();
                document.execCommand('insertHTML', false, html);
                upgradeEditorBlocks();
                updateEmptyState();
                notifyChanged();
                scheduleCaretAnchorNormalize();
                return;
              }

              e.preventDefault();
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
                savedParent: wrap.parentNode,
                savedNext: wrap.nextSibling,
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
                const sel = window.getSelection();
                if (sel) sel.removeAllRanges();
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

            function parsePositivePx(value) {
              const parsed = parseInt(String(value || '').trim(), 10);
              return !Number.isNaN(parsed) && parsed > 0 ? parsed : 0;
            }

            function parseCssWidthPx(styleValue) {
              if (!styleValue) return 0;
              const match = String(styleValue).match(/\bwidth\s*:\s*(\d+)\s*px/i);
              return match ? parsePositivePx(match[1]) : 0;
            }

            function readSavedImageWidthPx(wrap, img) {
              const wrapDataWidth = parsePositivePx(wrap.getAttribute('data-editor-width') || wrap.dataset.editorWidth);
              if (wrapDataWidth) return wrapDataWidth;

              const wrapStyleWidth = parseCssWidthPx(wrap.style.width || wrap.getAttribute('style'));
              if (wrapStyleWidth) return wrapStyleWidth;

              const imgDataWidth = parsePositivePx(img.getAttribute('data-editor-width') || img.dataset.editorWidth);
              if (imgDataWidth) return imgDataWidth;

              return 0;
            }

            function resolveImageWidthForSave(wrap, img) {
              const saved = readSavedImageWidthPx(wrap, img);
              if (wrap.classList.contains('is-sized') || wrap.dataset.userSized === '1' || saved) {
                if (saved) return saved;
                const measured = Math.round(wrap.getBoundingClientRect().width);
                if (measured > 0) return measured;
              }

              const wrapWidth = parseCssWidthPx(wrap.style.width || wrap.getAttribute('style'));
              if (wrapWidth) return wrapWidth;

              return saved;
            }

            function commitImageWidth(wrap, img, width) {
              if (!width) return;
              wrap.classList.add('is-sized');
              wrap.dataset.userSized = '1';
              wrap.dataset.editorWidth = String(width);
              wrap.setAttribute('data-editor-width', String(width));
              img.dataset.editorWidth = String(width);
              img.setAttribute('data-editor-width', String(width));
              wrap.style.width = width + 'px';
              wrap.setAttribute('style', 'width: ' + width + 'px;');
              img.style.width = '100%';
              img.style.height = 'auto';
              img.style.maxWidth = 'none';
              img.style.display = 'block';
              img.removeAttribute('width');
              img.removeAttribute('height');
            }

            function finalizeImageSizeFromMarkup(wrap, img) {
              const width = readSavedImageWidthPx(wrap, img);
              if (!width) return;

              wrap.classList.add('is-sized');
              wrap.dataset.editorWidth = String(width);
              wrap.setAttribute('data-editor-width', String(width));
              wrap.style.width = width + 'px';
              wrap.setAttribute('style', 'width: ' + width + 'px;');
              img.dataset.editorWidth = String(width);
              img.setAttribute('data-editor-width', String(width));
              img.removeAttribute('width');
              img.removeAttribute('height');
              img.style.width = '100%';
              img.style.height = 'auto';
              img.style.maxWidth = 'none';
              img.style.display = 'block';
            }

            function prepareImagesForSave() {
              editor.querySelectorAll('.editor-image-wrap').forEach(wrap => {
                const img = wrap.querySelector('img');
                if (!img) return;
                const width = resolveImageWidthForSave(wrap, img);
                if (!width) return;
                commitImageWidth(wrap, img, width);
                img.setAttribute('width', String(width));
              });
            }

            function attachImageSizeGuard(wrap, img) {
              if (img.dataset.sizeGuard === '1') return;
              img.dataset.sizeGuard = '1';

              function stabilizeImageSize() {
                finalizeImageSizeFromMarkup(wrap, img);
                requestAnimationFrame(() => finalizeImageSizeFromMarkup(wrap, img));
              }

              if (!img.complete)
                img.addEventListener('load', stabilizeImageSize, { once: true });
              else
                stabilizeImageSize();

              if (typeof img.decode === 'function') {
                img.decode().then(() => finalizeImageSizeFromMarkup(wrap, img)).catch(() => {});
              }
            }

            function reapplyAllImageSizes() {
              editor.querySelectorAll('.editor-image-wrap').forEach(wrap => {
                const img = wrap.querySelector('img');
                if (img) finalizeImageSizeFromMarkup(wrap, img);
              });
            }

            function setupImageResize(wrap, img, handle) {
              wrap.addEventListener('mousedown', (e) => {
                if (e.button !== 0 || e.target === handle || isOpenModifier(e)) return;
                const rect = wrap.getBoundingClientRect();
                const localX = e.clientX - rect.left;
                const edge = Math.min(10, rect.width * 0.15);
                if (localX <= edge) {
                  if (!e.shiftKey) {
                    wrap.classList.remove('is-selected');
                    placeCaretBefore(wrap);
                  }
                  return;
                }
                if (localX >= rect.width - edge) {
                  if (!e.shiftKey) {
                    wrap.classList.remove('is-selected');
                    placeCaretAfter(wrap);
                  }
                  return;
                }
                if (!e.shiftKey) {
                  editor.querySelectorAll('.editor-image-wrap.is-selected').forEach(w => w.classList.remove('is-selected'));
                  wrap.classList.add('is-selected');
                }
                beginImageMoveTracking(wrap, e);
              });

              handle.addEventListener('mousedown', (e) => {
                if (e.button !== 0 || isOpenModifier(e)) return;
                imageMoveSession = null;
                hideImageDropCaret();
                e.preventDefault();
                e.stopPropagation();
                wrap.classList.add('is-selected');
                const startX = e.clientX;
                const rectWidth = wrap.getBoundingClientRect().width;
                const startWidth = parseCssWidthPx(wrap.style.width || wrap.getAttribute('style'))
                  || (rectWidth > 0 ? Math.round(rectWidth) : 0)
                  || (img.naturalWidth || img.offsetWidth || 200);
                img.style.maxWidth = 'none';

                function onMove(ev) {
                  const width = Math.max(40, Math.round(startWidth + (ev.clientX - startX)));
                  commitImageWidth(wrap, img, width);
                }

                function onUp() {
                  document.removeEventListener('mousemove', onMove);
                  document.removeEventListener('mouseup', onUp);
                  const width = resolveImageWidthForSave(wrap, img);
                  if (width) commitImageWidth(wrap, img, width);
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
              finalizeImageSizeFromMarkup(wrap, img);
              setupImageResize(wrap, img, handle);
              ensureCaretAnchors(wrap);
              attachImageSizeGuard(wrap, img);
              wrap.dataset.resizeReady = '1';
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

            function getMeaningfulParagraphNodes(container) {
              return Array.from(container.childNodes).filter(node => {
                if (node.nodeType === Node.TEXT_NODE)
                  return node.textContent.replace(/\u200b/g, '').trim().length > 0;
                if (node.nodeType === Node.ELEMENT_NODE)
                  return true;
                return false;
              });
            }

            function unwrapStandaloneImageBlocks() {
              editor.querySelectorAll('p.editor-image-block').forEach(block => {
                block.classList.remove('editor-image-block');
              });

              editor.querySelectorAll(':scope > .editor-image-wrap').forEach(wrap => {
                const p = document.createElement('p');
                editor.insertBefore(p, wrap);
                p.appendChild(wrap);
                ensureCaretAnchors(wrap);
              });
            }

            function upgradeEditorBlocks() {
              editor.querySelectorAll('img').forEach(img => wrapImage(img));
              editor.querySelectorAll('.editor-image-wrap').forEach(wrap => ensureImageWrapReady(wrap));
              unwrapStandaloneImageBlocks();
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
                document.execCommand(
                  'insertHTML',
                  false,
                  '&#8203;<span class="editor-image-wrap" contenteditable="false"><img src="' + safeSrc + '" alt="' + safeAlt + '"><span class="editor-image-resize-handle" contenteditable="false"></span></span>&#8203;');
                upgradeEditorBlocks();
                const wraps = editor.querySelectorAll('.editor-image-wrap');
                if (wraps.length > 0) {
                  const lastWrap = wraps[wraps.length - 1];
                  ensureImageWrapReady(lastWrap);
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
                const range = caretRangeFromClientPoint(x, y);
                if (!range || !editor.contains(range.startContainer)) return false;
                range.collapse(true);
                const sel = window.getSelection();
                if (!sel) return false;
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
              getHtml() {
                prepareImagesForSave();
                return editor.innerHTML;
              },
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
                finalizeImageSizes();
              },
              finalizeImageSizes() {
                reapplyAllImageSizes();
              }
            };

            setThemeVars(defaultTheme);
            clearStaleInlineColors();
            upgradeEditorBlocks();
            reapplyAllImageSizes();
            updateEmptyState();
            window.addEventListener('load', () => {
              clearStaleInlineColors();
              upgradeEditorBlocks();
              reapplyAllImageSizes();
              requestAnimationFrame(() => {
                requestAnimationFrame(() => reapplyAllImageSizes());
              });
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