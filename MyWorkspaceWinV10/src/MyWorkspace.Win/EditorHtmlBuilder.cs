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
        var surface = ToCss(p.Surface);
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
              --editor-surface: {{surface}};
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
            #editor-file-drop-overlay {
              position: fixed;
              inset: 0;
              pointer-events: none;
              box-sizing: border-box;
              border: 2px solid transparent;
              z-index: 100000;
            }
            body.is-file-drop-target #editor-file-drop-overlay {
              border-color: var(--editor-accent);
              background: color-mix(in srgb, var(--editor-accent) 8%, transparent);
            }
            body.is-file-drop-target #editor {
              caret-color: transparent;
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
            code { background: var(--editor-code-bg); padding: 0.15em 0.4em; border-radius: 4px; font-family: Consolas, "Cascadia Mono", monospace; font-size: 0.92em; color: var(--editor-text) !important; border: 1px solid var(--editor-border); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--editor-border-light) 70%, transparent); }
            pre { background: var(--editor-code-bg); padding: 16px; border-radius: 8px; overflow-x: auto; margin: 0 0 14px; border: 1px solid var(--editor-border); }
            pre code { background: none; padding: 0; border: none; box-shadow: none; }
            blockquote { border-left: 4px solid var(--editor-accent); padding: 8px 16px; color: var(--editor-muted) !important; background: var(--editor-code-bg); margin: 0 0 14px; border: 1px solid var(--editor-border-light); border-left-width: 4px; }
            table { border-collapse: collapse; width: 100%; margin-bottom: 16px; border: 1px solid var(--editor-border); }
            th, td { border: 1px solid var(--editor-border); padding: 8px 12px; min-width: 40px; }
            th { background: color-mix(in srgb, var(--editor-code-bg) 78%, var(--editor-border)); font-weight: 600; }
            #editor td { background: color-mix(in srgb, var(--editor-surface) 72%, var(--editor-bg)); }
            #editor tbody tr:nth-child(even) td { background: color-mix(in srgb, var(--editor-code-bg) 82%, var(--editor-bg)); }
            #editor td .editor-image-wrap,
            #editor th .editor-image-wrap {
              max-width: 100%;
              vertical-align: middle;
            }
            #editor td .editor-image-wrap.is-sized,
            #editor th .editor-image-wrap.is-sized,
            #editor td .editor-image-wrap[data-editor-width],
            #editor th .editor-image-wrap[data-editor-width] {
              max-width: 100%;
            }
            ul, ol { margin: 0 0 14px; padding-left: 28px; }
            a { color: var(--editor-accent) !important; text-decoration: underline; }
            #editor a[href] { cursor: pointer; }
            #editor img { border-radius: 2px; }
            .editor-image-wrap {
              display: inline-block; position: relative;
              vertical-align: text-bottom; max-width: 100%;
              margin: 0 1px; line-height: inherit;
              cursor: text;
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
            .editor-image-wrap.is-move-source {
              opacity: 0.2;
              pointer-events: none;
            }
            #editor.is-image-move-target {
              box-shadow: inset 0 0 0 1px var(--editor-accent);
            }
            .editor-image-drop-caret {
              position: fixed; width: 2px; background: var(--editor-caret);
              pointer-events: none; z-index: 100001; display: none;
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
          <div id="editor-file-drop-overlay" aria-hidden="true"></div>
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
              surface: '{{surface}}',
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
              root.style.setProperty('--editor-surface', theme.surface || theme.bg);
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

            function selectNode(node) {
              if (!node) return false;
              const range = document.createRange();
              range.selectNode(node);
              const sel = window.getSelection();
              if (!sel) return false;
              sel.removeAllRanges();
              sel.addRange(range);
              return true;
            }

            function getSelectedImageWrap() {
              return editor.querySelector('.editor-image-wrap.is-selected');
            }

            function findCommentBlockElement(node) {
              let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
              while (el && el !== editor) {
                const tag = el.tagName;
                if (/^(P|H[1-6]|LI|BLOCKQUOTE|PRE|TD|TH|DIV)$/i.test(tag))
                  return el;
                el = el.parentElement;
              }
              return null;
            }

            function extractBlockQuoteText(block) {
              if (!block) return '';
              const clone = block.cloneNode(true);
              clone.querySelectorAll('.editor-image-wrap').forEach(wrap => {
                const img = wrap.querySelector('img');
                const alt = img?.getAttribute('alt') || '';
                const src = img?.getAttribute('src') || img?.src || '';
                const md = src ? (alt ? `![${alt}](${src})` : `![](${src})`) : '[image]';
                wrap.replaceWith(document.createTextNode(md));
              });
              clone.querySelectorAll('.editor-file-attachment').forEach(link => {
                link.replaceWith(document.createTextNode(link.textContent || '[file]'));
              });
              return clone.innerText.replace(/\u200b/gi, '').replace(/\s+/g, ' ').trim();
            }

            function extractVisualLineQuote(block, x, y) {
              const clickY = y;
              let bestTop = null;
              let bestDist = Infinity;
              const chars = [];
              const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
              let textNode;
              while (textNode = walker.nextNode()) {
                const content = textNode.textContent || '';
                for (let i = 0; i < content.length; i++) {
                  if (content[i] === '\u200B') continue;
                  const r = document.createRange();
                  r.setStart(textNode, i);
                  r.setEnd(textNode, i + 1);
                  const rects = r.getClientRects();
                  for (const rect of rects) {
                    if (rect.width <= 0 && rect.height <= 0) continue;
                    const midY = rect.top + rect.height / 2;
                    const dist = Math.abs(midY - clickY);
                    const top = Math.round(rect.top);
                    chars.push({ textNode, offset: i, top, char: content[i] });
                    if (dist < bestDist) {
                      bestDist = dist;
                      bestTop = top;
                    }
                  }
                }
              }

              if (bestTop === null) return '';

              const lineChars = chars
                .filter(c => c.top === bestTop)
                .sort((a, b) => {
                  if (a.textNode === b.textNode) return a.offset - b.offset;
                  const pos = a.textNode.compareDocumentPosition(b.textNode);
                  return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
                });

              return lineChars.map(c => c.char).join('').trim();
            }

            function getLineQuoteAtPoint(x, y) {
              const range = caretRangeFromClientPoint(x, y);
              if (!range || !editor.contains(range.startContainer))
                return '';

              const block = findCommentBlockElement(range.startContainer);
              if (!block || !editor.contains(block))
                return '';

              const visualLine = extractVisualLineQuote(block, x, y);
              if (visualLine)
                return visualLine;

              return extractBlockQuoteText(block);
            }

            function deleteNodeWithUndo(node) {
              if (!node || !selectNode(node)) return false;
              editor.focus();
              return document.execCommand('delete', false, null);
            }

            function insertHtmlWithUndo(html, range) {
              editor.focus();
              const sel = window.getSelection();
              if (!sel) return false;
              if (range) {
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
              }
              const ok = document.execCommand('insertHTML', false, html);
              if (ok) {
                upgradeEditorBlocks();
                scheduleCaretAnchorNormalize();
              }
              return ok;
            }

            function runEditorUndo() {
              editor.focus();
              const ok = document.execCommand('undo', false, null);
              if (ok) {
                upgradeEditorBlocks();
                updateEmptyState();
                notifyChanged();
              }
              return ok;
            }

            function runEditorRedo() {
              editor.focus();
              const ok = document.execCommand('redo', false, null);
              if (ok) {
                upgradeEditorBlocks();
                updateEmptyState();
                notifyChanged();
              }
              return ok;
            }
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

            function updateImageDropCaret(clientX, clientY, ignoreNode) {
              const marker = ensureImageDropCaret();
              const ignore = [ignoreNode, marker];
              if (imageMoveSession?.wrap)
                ignore.push(imageMoveSession.wrap);
              const range = resolveEditorCaretRange(clientX, clientY, ignore);
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
                const text = textNode.textContent || '';
                let offset = text.length;
                while (offset > 0 && text[offset - 1] === ZWSP)
                  offset--;
                range.setStart(textNode, offset);
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
                const textNode = node.nextSibling;
                const text = textNode.textContent || '';
                let offset = 0;
                while (offset < text.length && text[offset] === ZWSP)
                  offset++;
                range.setStart(textNode, offset);
              } else {
                range.setStartAfter(node);
              }
              range.collapse(true);
              const sel = window.getSelection();
              sel.removeAllRanges();
              sel.addRange(range);
            }

            function isZwspOnlyText(value) {
              return !(value || '').replace(/\u200B/g, '').length;
            }

            function isEditorImageWrap(node) {
              return !!node
                && node.nodeType === Node.ELEMENT_NODE
                && node.classList?.contains('editor-image-wrap');
            }

            function findImageWrapBeforeCaret(range) {
              if (!range || !range.collapsed)
                return null;

              const { startContainer, startOffset } = range;
              if (startContainer.nodeType === Node.TEXT_NODE) {
                const beforeText = (startContainer.textContent || '').slice(0, startOffset);
                if (beforeText.length > 0 && !isZwspOnlyText(beforeText))
                  return null;

                let prev = startContainer.previousSibling;
                while (prev) {
                  if (isEditorImageWrap(prev))
                    return prev;
                  if (prev.nodeType === Node.TEXT_NODE) {
                    if (!isZwspOnlyText(prev.textContent))
                      return null;
                  } else if (prev.nodeType === Node.ELEMENT_NODE) {
                    return null;
                  }
                  prev = prev.previousSibling;
                }
                return null;
              }

              if (startContainer.nodeType === Node.ELEMENT_NODE && editor.contains(startContainer) && startOffset > 0) {
                let prev = startContainer.childNodes[startOffset - 1];
                if (isEditorImageWrap(prev))
                  return prev;
                if (prev?.nodeType === Node.TEXT_NODE && isZwspOnlyText(prev.textContent)) {
                  prev = prev.previousSibling;
                  if (isEditorImageWrap(prev))
                    return prev;
                }
              }

              return null;
            }

            function findImageWrapAfterCaret(range) {
              if (!range || !range.collapsed)
                return null;

              const { startContainer, startOffset } = range;
              if (startContainer.nodeType === Node.TEXT_NODE) {
                const afterText = (startContainer.textContent || '').slice(startOffset);
                if (afterText.length > 0 && !isZwspOnlyText(afterText))
                  return null;

                let next = startContainer.nextSibling;
                while (next) {
                  if (isEditorImageWrap(next))
                    return next;
                  if (next.nodeType === Node.TEXT_NODE) {
                    if (!isZwspOnlyText(next.textContent))
                      return null;
                  } else if (next.nodeType === Node.ELEMENT_NODE) {
                    return null;
                  }
                  next = next.nextSibling;
                }
                return null;
              }

              if (startContainer.nodeType === Node.ELEMENT_NODE && editor.contains(startContainer)) {
                let next = startContainer.childNodes[startOffset];
                if (isEditorImageWrap(next))
                  return next;
                if (next?.nodeType === Node.TEXT_NODE && isZwspOnlyText(next.textContent)) {
                  next = next.nextSibling;
                  if (isEditorImageWrap(next))
                    return next;
                }
              }

              return null;
            }

            function removeZwspOnlyTextNode(node) {
              if (node?.nodeType === Node.TEXT_NODE && isZwspOnlyText(node.textContent))
                node.remove();
            }

            function restoreCaretBeforeRemovedImage(wrap) {
              const sel = window.getSelection();
              if (!sel)
                return;

              const prev = wrap.previousSibling;
              if (prev?.nodeType === Node.TEXT_NODE) {
                const text = prev.textContent || '';
                let offset = text.length;
                while (offset > 0 && text[offset - 1] === ZWSP)
                  offset--;
                const range = document.createRange();
                range.setStart(prev, offset);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
                return;
              }

              placeCaretBefore(wrap);
            }

            function removeInlineImageWrap(wrap) {
              if (!wrap || !editor.contains(wrap))
                return false;

              editor.querySelectorAll('.editor-image-wrap.is-selected').forEach(w => w.classList.remove('is-selected'));
              const trailing = wrap.nextSibling;
              restoreCaretBeforeRemovedImage(wrap);

              let removed = deleteNodeWithUndo(wrap);
              if (!removed) {
                wrap.remove();
                removed = true;
              }

              removeZwspOnlyTextNode(trailing);
              scheduleCaretAnchorNormalize();
              updateEmptyState();
              notifyChanged();
              return removed;
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
              const hasMedia = !!editor.querySelector('img, table, hr, .editor-file-attachment, ul, ol, blockquote, pre');
              const text = editor.innerText.replace(/\u00a0/g, ' ').replace(/\u200b/gi, '').trim();
              const empty = text.length === 0 && !hasMedia;
              editor.dataset.empty = empty ? 'true' : 'false';
              if (empty && editor.innerHTML.replace(/<[^>]+>/g, '').replace(/\u200b/gi, '').trim() === '') {
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

            function ensureTableCellEditable(cell) {
              if (!cell || !editor.contains(cell))
                return;
              if (cell.querySelector(':scope > table'))
                return;

              const hasDirectBlock = cell.querySelector(
                ':scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > ul, :scope > ol, :scope > blockquote, :scope > pre');
              if (hasDirectBlock)
                return;

              const p = document.createElement('p');
              if (cell.childNodes.length === 0)
                p.appendChild(document.createElement('br'));
              else
                while (cell.firstChild)
                  p.appendChild(cell.firstChild);
              cell.appendChild(p);
            }

            function getTableCellInsertBlock(cell) {
              if (!cell)
                return null;
              ensureTableCellEditable(cell);
              return cell.querySelector('p') || cell;
            }

            function caretRangeFromCellPoint(cell, x, y) {
              const block = getTableCellInsertBlock(cell);
              if (!block)
                return null;

              for (const child of Array.from(block.childNodes)) {
                if (child.nodeType === Node.ELEMENT_NODE && child.classList?.contains('editor-image-wrap')) {
                  const rect = child.getBoundingClientRect();
                  if (x <= rect.left + rect.width / 2) {
                    const range = document.createRange();
                    range.setStartBefore(child);
                    range.collapse(true);
                    return range;
                  }
                  if (x <= rect.right) {
                    const range = document.createRange();
                    range.setStartAfter(child);
                    range.collapse(true);
                    return range;
                  }
                  continue;
                }

                if (child.nodeType === Node.TEXT_NODE) {
                  const text = child.textContent || '';
                  for (let i = 0; i < text.length; i++) {
                    if (text[i] === ZWSP) continue;
                    const probe = document.createRange();
                    probe.setStart(child, i);
                    probe.setEnd(child, i + 1);
                    const rect = probe.getBoundingClientRect();
                    if (rect.width <= 0 && rect.height <= 0) continue;
                    if (x <= rect.left + rect.width / 2) {
                      probe.collapse(true);
                      return probe;
                    }
                  }
                }
              }

              const blockRect = block.getBoundingClientRect();
              const fallback = document.createRange();
              fallback.selectNodeContents(block);
              fallback.collapse(x <= blockRect.left + blockRect.width / 2);
              return fallback;
            }

            function normalizeRangeForTableInsert(range) {
              if (!range)
                return null;

              let node = range.startContainer;
              if (node.nodeType === Node.TEXT_NODE)
                node = node.parentNode;

              const cell = node?.closest?.('td, th');
              if (!cell || !editor.contains(cell))
                return range;

              const block = getTableCellInsertBlock(cell);
              const normalized = range.cloneRange();
              normalized.collapse(true);

              if (block.contains(normalized.startContainer))
                return normalized;

              if (normalized.startContainer === cell || normalized.startContainer === block) {
                const offset = normalized.startOffset;
                const candidates = normalized.startContainer === cell
                  ? Array.from(cell.childNodes)
                  : Array.from(block.childNodes);
                const child = candidates[offset] || candidates[candidates.length - 1];
                if (child?.nodeType === Node.TEXT_NODE) {
                  normalized.setStart(child, Math.min(offset, child.textContent?.length || 0));
                  normalized.collapse(true);
                  return normalized;
                }
                if (child) {
                  normalized.setStartBefore(child);
                  normalized.collapse(true);
                  return normalized;
                }
                normalized.selectNodeContents(block);
                normalized.collapse(true);
                return normalized;
              }

              const meaningful = getMeaningfulParagraphNodes(block);
              if (meaningful.length > 0) {
                normalized.setStartAfter(meaningful[meaningful.length - 1]);
                normalized.collapse(true);
                return normalized;
              }

              normalized.selectNodeContents(block);
              normalized.collapse(true);
              return normalized;
            }

            function upgradeTableCells() {
              editor.querySelectorAll('td, th').forEach(cell => ensureTableCellEditable(cell));
            }

            function ensureInsertLocation() {
              ensureParagraph();
              upgradeTableCells();
              const sel = window.getSelection();
              if (!sel || sel.rangeCount === 0)
                return;

              let anchor = sel.anchorNode;
              if (anchor?.nodeType === Node.TEXT_NODE)
                anchor = anchor.parentElement;

              const cell = anchor?.closest?.('td, th');
              if (!cell || !editor.contains(cell))
                return;

              ensureTableCellEditable(cell);
              const block = cell.querySelector('p') || cell;
              if (!block.contains(sel.anchorNode))
                placeCaretAtEnd(block);
            }

            function isIgnoredHitTarget(el, ignored) {
              return (ignored || []).some(node => node && (node === el || node.contains?.(el)));
            }

            function caretRangeBeforeAfterImageWrap(wrap, clientX) {
              const rect = wrap.getBoundingClientRect();
              const range = document.createRange();
              if (clientX <= rect.left + rect.width / 2)
                range.setStartBefore(wrap);
              else
                range.setStartAfter(wrap);
              range.collapse(true);
              return range;
            }

            function resolveEditorCaretRange(x, y, ignoreNodes) {
              const ignored = (ignoreNodes || []).filter(Boolean);

              let range = caretRangeFromClientPoint(x, y);
              if (range && editor.contains(range.startContainer)) {
                let container = range.startContainer;
                if (container.nodeType === Node.TEXT_NODE)
                  container = container.parentNode;
                const hitWrap = container?.closest?.('.editor-image-wrap');
                if (hitWrap && editor.contains(hitWrap) && !isIgnoredHitTarget(hitWrap, ignored))
                  return caretRangeBeforeAfterImageWrap(hitWrap, x);
                if (!isIgnoredHitTarget(container, ignored))
                  return range;
              }

              if (typeof document.elementsFromPoint !== 'function')
                return null;

              const stack = document.elementsFromPoint(x, y);
              for (const el of stack) {
                if (isIgnoredHitTarget(el, ignored))
                  continue;

                const imageWrap = el.closest?.('.editor-image-wrap');
                if (imageWrap && editor.contains(imageWrap) && !isIgnoredHitTarget(imageWrap, ignored))
                  return caretRangeBeforeAfterImageWrap(imageWrap, x);

                if (!editor.contains(el))
                  continue;

                const cell = el.closest?.('td, th');
                if (cell && editor.contains(cell)) {
                  const cellRange = caretRangeFromCellPoint(cell, x, y);
                  if (cellRange && editor.contains(cellRange.startContainer))
                    return cellRange;
                }

                const retry = caretRangeFromClientPoint(x, y);
                if (retry && editor.contains(retry.startContainer))
                  return retry;
              }

              return null;
            }

            function caretRangeFromEditorPoint(x, y, ignoreNodes) {
              return resolveEditorCaretRange(x, y, ignoreNodes);
            }

            function getImageMaxWidthForWrap(wrap) {
              const cell = wrap?.closest?.('td, th');
              if (cell)
                return Math.max(40, cell.clientWidth - 16);
              return Math.max(120, editor.clientWidth - 64);
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
            let fileDropCaretRange = null;
            let fileDropFeedbackEpoch = 0;
            let pendingFileDropInsertRange = null;
            let pendingFileDropInsertMarker = null;
            let lastFileDropPoint = null;
            let lastExternalFileDropAt = 0;
            let lastExternalFileDropX = 0;
            let lastExternalFileDropY = 0;

            function clearFileDropInsertMarker() {
              if (pendingFileDropInsertMarker?.parentNode)
                pendingFileDropInsertMarker.remove();
              pendingFileDropInsertMarker = null;
            }

            function invalidateFileDropFeedback() {
              fileDropFeedbackEpoch++;
              hideFileDropCaret();
              document.body.classList.remove('is-file-drop-target');
            }

            function setFileDropHighlightActive(active, hideCaret = true) {
              document.body.classList.toggle('is-file-drop-target', !!active);
              if (!active && hideCaret)
                invalidateFileDropFeedback();
            }

            function hideFileDropCaret() {
              if (imageDropCaret) imageDropCaret.style.display = 'none';
              fileDropCaretRange = null;
            }

            function showFileDropCaretAtClientPoint(x, y) {
              const epoch = fileDropFeedbackEpoch;
              editor.blur();
              const sel = window.getSelection();
              if (sel) sel.removeAllRanges();

              const range = caretRangeFromEditorPoint(x, y, [imageDropCaret]);
              if (!range || !editor.contains(range.startContainer)) {
                if (epoch === fileDropFeedbackEpoch) hideFileDropCaret();
                return false;
              }
              if (epoch !== fileDropFeedbackEpoch) return false;

              range.collapse(true);
              fileDropCaretRange = range.cloneRange();

              const rect = getCaretRectFromRange(range);
              if (epoch !== fileDropFeedbackEpoch) return false;

              const marker = ensureImageDropCaret();
              const lineHeight = parseFloat(window.getComputedStyle(editor).lineHeight) || 20;
              const height = Math.max(rect.height || 0, lineHeight, 14);
              marker.style.display = 'block';
              marker.style.left = Math.round(rect.left) + 'px';
              marker.style.top = Math.round(rect.top) + 'px';
              marker.style.height = Math.round(height) + 'px';
              return true;
            }

            function consumePendingInsertRange() {
              if (pendingFileDropInsertMarker?.parentNode) {
                const range = document.createRange();
                range.setStartBefore(pendingFileDropInsertMarker);
                range.collapse(true);
                return range;
              }

              const range = pendingFileDropInsertRange;
              pendingFileDropInsertRange = null;
              return range;
            }

            function resolveInsertRangeAtPoint(x, y, ignoreNodes) {
              let range = resolveEditorCaretRange(x, y, ignoreNodes);
              if (!range || !editor.contains(range.startContainer))
                return null;

              range = range.cloneRange();
              range.collapse(true);

              let anchor = range.startContainer;
              if (anchor.nodeType === Node.TEXT_NODE)
                anchor = anchor.parentElement;
              const cell = anchor?.closest?.('td, th');
              if (cell)
                ensureTableCellEditable(cell);

              return normalizeRangeForTableInsert(range) || range;
            }

            function hasValidEditorSelection() {
              const sel = window.getSelection();
              return !!(sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode));
            }

            function createImageWrapElement(instanceId, src, alt) {
              const wrap = document.createElement('span');
              wrap.className = 'editor-image-wrap';
              wrap.contentEditable = 'false';
              wrap.dataset.editorInstanceId = instanceId;
              const img = document.createElement('img');
              img.src = src;
              img.alt = alt || '';
              wrap.appendChild(img);
              const handle = document.createElement('span');
              handle.className = 'editor-image-resize-handle';
              handle.contentEditable = 'false';
              wrap.appendChild(handle);
              return wrap;
            }

            function insertImageWrapAtRange(range, instanceId, src, alt) {
              if (!range || !editor.contains(range.startContainer))
                return null;

              range.collapse(true);
              const wrap = createImageWrapElement(instanceId, src, alt);
              const fragment = document.createDocumentFragment();
              fragment.appendChild(document.createTextNode(ZWSP));
              fragment.appendChild(wrap);
              fragment.appendChild(document.createTextNode(ZWSP));
              range.insertNode(fragment);
              return wrap;
            }

            function finalizeInsertedImageWrap(insertedWrap) {
              if (!insertedWrap || !editor.contains(insertedWrap)) {
                clearFileDropInsertMarker();
                pendingFileDropInsertRange = null;
                lastFileDropPoint = null;
                return null;
              }

              clearFileDropInsertMarker();
              pendingFileDropInsertRange = null;
              lastFileDropPoint = null;

              const img = insertedWrap.querySelector('img');
              ensureImageWrapReady(insertedWrap);
              if (img) attachImageLoadHandlers(insertedWrap, img);
              placeCaretAfter(insertedWrap);

              upgradeEditorBlocks();
              updateEmptyState();
              notifyChanged();
              scheduleCaretAnchorNormalize();
              return insertedWrap;
            }

            function insertImageAtCaret(src, alt, preferredRange, usePendingDropRange) {
              hideFileDropCaret();
              editor.focus();

              let range = preferredRange ? preferredRange.cloneRange() : null;
              if (!range && usePendingDropRange)
                range = consumePendingInsertRange();
              if (!range && !hasValidEditorSelection() && lastFileDropPoint) {
                range = resolveInsertRangeAtPoint(lastFileDropPoint.x, lastFileDropPoint.y, [imageDropCaret]);
              }
              if (!range && hasValidEditorSelection()) {
                range = window.getSelection().getRangeAt(0).cloneRange();
              }

              if (range && editor.contains(range.startContainer)) {
                let anchor = range.startContainer;
                if (anchor.nodeType === Node.TEXT_NODE)
                  anchor = anchor.parentElement;
                const cell = anchor?.closest?.('td, th');
                if (cell)
                  ensureTableCellEditable(cell);
                range = normalizeRangeForTableInsert(range) || range;
              }
              const instanceId = 'img-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
              let insertedWrap = null;

              if (range && editor.contains(range.startContainer)) {
                insertedWrap = insertImageWrapAtRange(range, instanceId, src, alt);
              }

              if (!insertedWrap) {
                ensureInsertLocation();
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) {
                  range = sel.getRangeAt(0).cloneRange();
                  range = normalizeRangeForTableInsert(range) || range;
                  if (range && editor.contains(range.startContainer))
                    insertedWrap = insertImageWrapAtRange(range, instanceId, src, alt);
                }
              }

              if (!insertedWrap) {
                ensureInsertLocation();
                const safeSrc = escapeHtml(src);
                const safeAlt = escapeHtml(alt || '');
                document.execCommand(
                  'insertHTML',
                  false,
                  '&#8203;<span class="editor-image-wrap" contenteditable="false" data-editor-instance-id="' + instanceId + '"><img src="' + safeSrc + '" alt="' + safeAlt + '"><span class="editor-image-resize-handle" contenteditable="false"></span></span>&#8203;');
                insertedWrap = editor.querySelector('.editor-image-wrap[data-editor-instance-id="' + instanceId + '"]');
              }

              return finalizeInsertedImageWrap(insertedWrap);
            }

            function commitFileDropCaretAtPointImpl(x, y) {
              fileDropFeedbackEpoch++;
              const savedRange = fileDropCaretRange;
              if (imageDropCaret) imageDropCaret.style.display = 'none';
              fileDropCaretRange = null;
              document.body.classList.remove('is-file-drop-target');
              lastFileDropPoint = { x, y };

              clearFileDropInsertMarker();
              pendingFileDropInsertRange = null;

              let range = savedRange ? savedRange.cloneRange() : resolveInsertRangeAtPoint(x, y, [imageDropCaret]);
              if (range)
                range.collapse(true);

              if (!range || !editor.contains(range.startContainer)) {
                pendingFileDropInsertRange = null;
                return false;
              }

              const marker = document.createElement('span');
              marker.setAttribute('data-file-drop-insert-marker', '1');
              marker.textContent = ZWSP;
              marker.style.position = 'absolute';
              marker.style.width = '0';
              marker.style.height = '0';
              marker.style.overflow = 'hidden';
              marker.style.pointerEvents = 'none';

              try {
                range.insertNode(marker);
              } catch {
                pendingFileDropInsertRange = null;
                return false;
              }

              if (!marker.parentNode) {
                pendingFileDropInsertRange = null;
                return false;
              }

              pendingFileDropInsertMarker = marker;
              pendingFileDropInsertRange = range.cloneRange();

              editor.focus();
              const sel = window.getSelection();
              if (sel) {
                const caret = document.createRange();
                caret.setStartBefore(marker);
                caret.collapse(true);
                sel.removeAllRanges();
                sel.addRange(caret);
              }
              return true;
            }

            function cancelFileDropFeedback() {
              invalidateFileDropFeedback();
              clearFileDropInsertMarker();
              pendingFileDropInsertRange = null;
              lastFileDropPoint = null;
            }

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
              return commitFileDropCaretAtPointImpl(x, y);
            }

            function isDroppedImageFile(file) {
              if (!file) return false;
              const type = String(file.type || '').toLowerCase();
              if (type.startsWith('image/')) return true;
              const name = String(file.name || '').toLowerCase();
              return /\.(jpe?g|png|gif|webp|avif|svg)$/.test(name);
            }

            function postImageFileAsDataUri(webview, imageFile, clientX, clientY) {
              const reader = new FileReader();
              reader.onload = () => {
                const fallbackPayload = JSON.stringify({
                  type: 'file-drop',
                  x: Math.round(clientX),
                  y: Math.round(clientY),
                  dataUri: String(reader.result || ''),
                  fileName: imageFile.name || 'image.png'
                });
                webview.postMessage(fallbackPayload);
              };
              reader.readAsDataURL(imageFile);
            }

            function postFileDropMessage(files, clientX, clientY) {
              if (!files || files.length === 0) return;
              const payload = JSON.stringify({
                type: 'file-drop',
                x: Math.round(clientX),
                y: Math.round(clientY)
              });
              const webview = window.chrome?.webview;
              if (!webview) return;

              if (webview.postMessageWithAdditionalObjects) {
                try {
                  // WebView2 expects one ArrayLike second argument (FileList), not spread File items.
                  webview.postMessageWithAdditionalObjects(payload, files);
                  return;
                } catch {
                  // Fall through to data-uri fallback for images.
                }
              }

              const fileList = Array.from(files);
              const imageFile = fileList.find(isDroppedImageFile);
              if (imageFile && webview.postMessage) {
                postImageFileAsDataUri(webview, imageFile, clientX, clientY);
                return;
              }

              if (webview.postMessage)
                webview.postMessage(payload);
            }

            function handleExternalFileDragOver(e) {
              if (!isExternalFileDrag(e)) return;
              e.preventDefault();
              if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
              setFileDropHighlightActive(true, false);
              showFileDropCaretAtClientPoint(e.clientX, e.clientY);
            }

            function handleExternalFileDrop(e) {
              if (!isExternalFileDrag(e)) return;
              e.preventDefault();
              e.stopPropagation();

              const now = Date.now();
              if (now - lastExternalFileDropAt < 400 &&
                  Math.abs(e.clientX - lastExternalFileDropX) < 3 &&
                  Math.abs(e.clientY - lastExternalFileDropY) < 3)
                return;
              lastExternalFileDropAt = now;
              lastExternalFileDropX = e.clientX;
              lastExternalFileDropY = e.clientY;

              fileDropDepth = 0;
              invalidateFileDropFeedback();
              showFileDropCaretAtClientPoint(e.clientX, e.clientY);
              commitFileDropCaretAtPointImpl(e.clientX, e.clientY);
              postFileDropMessage(e.dataTransfer?.files, e.clientX, e.clientY);
            }

            editor.addEventListener('dragenter', (e) => {
              if (!isExternalFileDrag(e)) return;
              e.preventDefault();
              fileDropDepth++;
              setFileDropHighlightActive(true);
            });

            editor.addEventListener('dragleave', (e) => {
              if (!isExternalFileDrag(e)) return;
              fileDropDepth = Math.max(0, fileDropDepth - 1);
              if (fileDropDepth === 0 && !pendingFileDropInsertMarker?.parentNode)
                cancelFileDropFeedback();
            });

            editor.addEventListener('dragover', handleExternalFileDragOver);
            document.addEventListener('dragover', handleExternalFileDragOver, true);

            document.addEventListener('dragenter', (e) => {
              if (!isExternalFileDrag(e)) return;
              e.preventDefault();
              setFileDropHighlightActive(true);
            }, true);

            document.addEventListener('drop', handleExternalFileDrop, true);

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
                const cell = e.target.closest('td, th');
                if (cell && editor.contains(cell) && !e.target.closest('.editor-image-wrap'))
                  ensureTableCellEditable(cell);
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
            editor.addEventListener('compositionstart', () => {
              const selectedImage = editor.querySelector('.editor-image-wrap.is-selected');
              if (!selectedImage)
                return;
              selectedImage.classList.remove('is-selected');
              placeCaretBefore(selectedImage);
            });
            editor.addEventListener('compositionend', () => { updateEmptyState(); notifyChanged(); });
            editor.addEventListener('contextmenu', (e) => { e.preventDefault(); });

            editor.addEventListener('keydown', (e) => {
              if (e.key === 'Escape' && imageMoveSession) {
                const session = imageMoveSession;
                removeImageMoveGhost(session);
                session.wrap.classList.remove('is-move-source');
                editor.classList.remove('is-image-move-target');
                hideImageDropCaret();
                imageMoveSession = null;
                session.wrap.classList.add('is-selected');
                e.preventDefault();
                return;
              }
              const selectedImage = editor.querySelector('.editor-image-wrap.is-selected');
              const sel = window.getSelection();
              const hasTextSelection = sel && !sel.isCollapsed &&
                sel.rangeCount > 0 && editor.contains(sel.anchorNode);
              const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;

              if (!hasTextSelection && range && (e.key === 'Backspace' || e.key === 'Delete')) {
                const adjacentWrap = e.key === 'Backspace'
                  ? findImageWrapBeforeCaret(range)
                  : findImageWrapAfterCaret(range);
                if (adjacentWrap) {
                  e.preventDefault();
                  removeInlineImageWrap(adjacentWrap);
                  return;
                }
              }

              if (selectedImage && !hasTextSelection && (e.key === 'Backspace' || e.key === 'Delete')) {
                e.preventDefault();
                removeInlineImageWrap(selectedImage);
                return;
              }
              if (selectedImage && !hasTextSelection && !e.ctrlKey && !e.metaKey && !e.altKey &&
                  e.key.length === 1 && e.key !== 'Enter' && !e.key.startsWith('Arrow') &&
                  e.key !== 'Backspace' && e.key !== 'Delete' && e.key !== 'Tab') {
                selectedImage.classList.remove('is-selected');
                placeCaretBefore(selectedImage);
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
              if (!hasTextSelection && !selectedImage && range) {
                if (e.key === 'ArrowLeft') {
                  const wrap = findImageWrapBeforeCaret(range);
                  if (wrap) {
                    e.preventDefault();
                    placeCaretBefore(wrap);
                    return;
                  }
                }
                if (e.key === 'ArrowRight') {
                  const wrap = findImageWrapAfterCaret(range);
                  if (wrap) {
                    e.preventDefault();
                    placeCaretAfter(wrap);
                    return;
                  }
                }
              }
              if (e.ctrlKey || e.metaKey) {
                if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); runEditorUndo(); return; }
                if (e.key === 'y' || (e.key === 'z' && e.shiftKey) || (e.key === 'Z' && e.shiftKey)) { e.preventDefault(); runEditorRedo(); return; }
                if (e.key === 'b') { e.preventDefault(); window.editorApi.applyFormat('bold'); return; }
                if (e.key === 'i') { e.preventDefault(); window.editorApi.applyFormat('italic'); return; }
                if (e.key === 'u') { e.preventDefault(); window.editorApi.applyFormat('underline'); return; }
              }
            });

            editor.addEventListener('paste', (e) => {
              const clipboard = e.clipboardData || window.clipboardData;
              const html = clipboard ? clipboard.getData('text/html') : '';
              const text = clipboard ? clipboard.getData('text/plain') : '';

              function htmlContainsPageAssetReference(value) {
                return /page-asset:|page-assets\.myworkspace/i.test(value || '');
              }

              if (html && (html.includes('editor-image-wrap') || /<img\b/i.test(html))) {
                e.preventDefault();
                if (htmlContainsPageAssetReference(html) && window.chrome?.webview?.postMessage) {
                  window.chrome.webview.postMessage(JSON.stringify({ type: 'clone-pasted-html', html }));
                  scheduleCaretAnchorNormalize();
                  return;
                }
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
                html: wrap.outerHTML,
                ghost: null,
                moveToken: null,
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

            function removeImageMoveGhost(session) {
              if (!session?.ghost?.parentNode)
                return;
              session.ghost.parentNode.removeChild(session.ghost);
              session.ghost = null;
            }

            function rangeIntersectsNode(range, node) {
              if (!range || !node) return false;
              if (node === range.startContainer || node === range.endContainer) return true;
              return node.contains(range.startContainer);
            }

            function normalizeImageDropRange(range, clientX) {
              if (!range) return null;
              const normalized = range.cloneRange();
              normalized.collapse(true);

              let container = normalized.startContainer;
              if (container.nodeType === Node.TEXT_NODE)
                container = container.parentNode;

              const targetWrap = container?.closest?.('.editor-image-wrap');
              if (targetWrap && editor.contains(targetWrap)) {
                if (typeof clientX === 'number')
                  return caretRangeBeforeAfterImageWrap(targetWrap, clientX);
                normalized.setStartAfter(targetWrap);
                normalized.collapse(true);
                container = normalized.startContainer;
                if (container.nodeType === Node.TEXT_NODE)
                  container = container.parentNode;
              }

              if (container && (container.tagName === 'TD' || container.tagName === 'TH')) {
                ensureTableCellEditable(container);
                if (typeof clientX === 'number') {
                  const cellRange = caretRangeFromCellPoint(container, clientX, 0);
                  if (cellRange)
                    return cellRange;
                }
                return normalizeRangeForTableInsert(normalized) || normalized;
              }

              const cell = container?.closest?.('td, th');
              if (cell && editor.contains(cell)) {
                if (typeof clientX === 'number') {
                  const cellRange = caretRangeFromCellPoint(cell, clientX, 0);
                  if (cellRange)
                    return cellRange;
                }
                return normalizeRangeForTableInsert(normalized) || normalized;
              }

              return normalized;
            }

            function isValidImageDropRange(range, movingWrap) {
              if (!range || !editor.contains(range.startContainer) || !movingWrap?.parentNode)
                return false;

              if (rangeIntersectsNode(range, movingWrap))
                return false;

              const probe = range.cloneRange();
              probe.collapse(true);
              const parent = movingWrap.parentNode;
              if (probe.startContainer === parent) {
                const child = parent.childNodes[probe.startOffset];
                if (child === movingWrap || child === movingWrap.nextSibling)
                  return false;
              }

              return true;
            }

            function resolveImageDropRangeAtPoint(session, clientX, clientY) {
              const wrap = session.wrap;
              const ignore = [session.ghost, wrap, imageDropCaret];
              const prevVisibility = wrap.style.visibility;
              wrap.style.visibility = 'hidden';
              let dropRange = resolveEditorCaretRange(clientX, clientY, ignore);
              wrap.style.visibility = prevVisibility;
              return normalizeImageDropRange(dropRange, clientX);
            }

            function pickImageDropRange(session, clientX, clientY, savedDropRange) {
              const wrap = session.wrap;
              const candidates = [];

              const atPoint = resolveImageDropRangeAtPoint(session, clientX, clientY);
              if (atPoint) candidates.push(atPoint);

              if (savedDropRange) {
                const saved = normalizeImageDropRange(savedDropRange.cloneRange(), clientX);
                if (saved) candidates.push(saved);
              }

              for (const range of candidates) {
                if (isValidImageDropRange(range, wrap))
                  return range;
              }
              return null;
            }

            function moveImageWrapDom(wrap, range, session) {
              if (!wrap?.parentNode || !range || !editor.contains(range.startContainer))
                return false;

              const savedParent = wrap.parentNode;
              const savedNext = wrap.nextSibling;
              const marker = document.createElement('span');
              marker.setAttribute('data-image-drop-marker', '1');
              marker.textContent = ZWSP;

              try {
                range.collapse(true);
                range.insertNode(marker);
              } catch {
                return false;
              }

              if (!marker.parentNode) {
                marker.remove();
                return false;
              }

              wrap.classList.remove('is-move-source', 'is-dragging', 'is-selected');
              savedParent.removeChild(wrap);

              try {
                marker.parentNode.insertBefore(wrap, marker);
              } catch {
                if (savedNext && savedNext.parentNode === savedParent)
                  savedParent.insertBefore(wrap, savedNext);
                else if (session?.savedParent && editor.contains(session.savedParent))
                  session.savedParent.appendChild(wrap);
                else
                  savedParent.appendChild(wrap);
                marker.remove();
                return false;
              }

              marker.remove();
              ensureImageWrapReady(wrap);
              ensureCaretAnchors(wrap);
              return true;
            }

            function selectMovedImageWrap(wrap, moveToken) {
              editor.querySelectorAll('.editor-image-wrap.is-selected').forEach(w => w.classList.remove('is-selected'));
              if (!wrap || !editor.contains(wrap)) return;
              wrap.classList.add('is-selected');
              wrap.removeAttribute('data-transient-move-id');
            }

            function finishImageMove(e) {
              const session = imageMoveSession;
              imageMoveSession = null;
              editor.classList.remove('is-image-move-target');
              const savedDropRange = session?.dropRange ? session.dropRange.cloneRange() : null;
              hideImageDropCaret();
              if (!session) return;

              const wrap = session.wrap;
              removeImageMoveGhost(session);
              wrap.classList.remove('is-move-source');

              if (!session.dragging) return;

              suppressNextImageClick = true;
              const dropRange = pickImageDropRange(session, e.clientX, e.clientY, savedDropRange);

              if (dropRange && moveImageWrapDom(wrap, dropRange, session)) {
                selectMovedImageWrap(wrap, session.moveToken);
                placeCaretAfter(wrap);
                updateEmptyState();
                notifyChanged();
                return;
              }

              wrap.classList.add('is-selected');
              updateEmptyState();
            }

            document.addEventListener('mousemove', (e) => {
              const session = imageMoveSession;
              if (!session) return;

              const wrap = session.wrap;
              const dx = e.clientX - session.startX;
              const dy = e.clientY - session.startY;

              if (!session.dragging) {
                if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
                session.dragging = true;
                session.moveToken = 'm' + Date.now();
                wrap.dataset.transientMoveId = session.moveToken;
                session.html = wrap.outerHTML;
                const sel = window.getSelection();
                if (sel) sel.removeAllRanges();
                const rect = wrap.getBoundingClientRect();
                session.offsetX = e.clientX - rect.left;
                session.offsetY = e.clientY - rect.top;
                const ghost = wrap.cloneNode(true);
                ghost.classList.add('is-dragging');
                ghost.classList.remove('is-selected');
                ghost.style.position = 'fixed';
                ghost.style.left = rect.left + 'px';
                ghost.style.top = rect.top + 'px';
                ghost.style.margin = '0';
                ghost.style.zIndex = '10000';
                ghost.style.pointerEvents = 'none';
                document.body.appendChild(ghost);
                session.ghost = ghost;
                wrap.classList.add('is-move-source');
                editor.classList.add('is-image-move-target');
              }

              e.preventDefault();

              if (session.ghost) {
                session.ghost.style.left = (e.clientX - session.offsetX) + 'px';
                session.ghost.style.top = (e.clientY - session.offsetY) + 'px';
              }

              updateImageDropCaret(e.clientX, e.clientY, session.ghost);
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

            function applyDefaultImageDisplaySize(wrap, img) {
              if (!wrap || !img || readSavedImageWidthPx(wrap, img) > 0) return;
              if (wrap.classList.contains('is-sized')) return;
              const naturalWidth = img.naturalWidth || 0;
              if (naturalWidth <= 0) return;
              const maxWidth = getImageMaxWidthForWrap(wrap);
              const width = Math.min(naturalWidth, maxWidth);
              img.style.width = width + 'px';
              img.style.height = 'auto';
              img.style.maxWidth = '100%';
              img.style.display = 'block';
            }

            function attachImageLoadHandlers(wrap, img) {
              if (!img || img.dataset.loadHandlers === '1') return;
              img.dataset.loadHandlers = '1';
              img.addEventListener('load', () => {
                applyDefaultImageDisplaySize(wrap, img);
                finalizeImageSizeFromMarkup(wrap, img);
              }, { once: true });
              img.addEventListener('error', () => {
                const src = img.getAttribute('src');
                if (!src || img.dataset.retried === '1') return;
                img.dataset.retried = '1';
                const retryUrl = src + (src.includes('?') ? '&' : '?') + 't=' + Date.now();
                img.setAttribute('src', retryUrl);
              }, { once: true });
              if (img.complete && img.naturalWidth > 0)
                applyDefaultImageDisplaySize(wrap, img);
            }

            function attachImageSizeGuard(wrap, img) {
              attachImageLoadHandlers(wrap, img);
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
                if (!img) return;
                attachImageLoadHandlers(wrap, img);
                finalizeImageSizeFromMarkup(wrap, img);
                applyDefaultImageDisplaySize(wrap, img);
              });
            }

            function setupImageResize(wrap, img, handle) {
              wrap.addEventListener('mousedown', (e) => {
                if (e.button !== 0 || e.target === handle || isOpenModifier(e)) return;
                e.preventDefault();
                e.stopPropagation();
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
                  wrap.style.width = width + 'px';
                  wrap.style.maxWidth = 'none';
                  img.style.width = '100%';
                  img.style.height = 'auto';
                  img.style.maxWidth = 'none';
                  img.style.display = 'block';
                }

                function onUp(ev) {
                  document.removeEventListener('mousemove', onMove);
                  document.removeEventListener('mouseup', onUp);
                  const width = Math.max(40, Math.round(startWidth + (ev.clientX - startX)));
                  commitImageWidth(wrap, img, width);
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
              upgradeTableCells();
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
                return runEditorUndo();
              },
              redo() {
                return runEditorRedo();
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
                return insertImageAtCaret(src, alt, null, false);
              },
              insertImageAtDropPoint(x, y, src, alt) {
                if (!pendingFileDropInsertMarker?.parentNode && !pendingFileDropInsertRange)
                  commitFileDropCaretAtPointImpl(x, y);
                return insertImageAtCaret(src, alt, null, true);
              },
              insertFileAttachment(href, fileName) {
                hideFileDropCaret();
                editor.focus();
                ensureInsertLocation();
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
              getContextMenuContext(x, y) {
                const hit = document.elementFromPoint(x, y);
                const wrap = hit?.closest('.editor-image-wrap');
                if (wrap && editor.contains(wrap)) {
                  editor.querySelectorAll('.editor-image-wrap.is-selected').forEach(w => {
                    if (w !== wrap) w.classList.remove('is-selected');
                  });
                  wrap.classList.add('is-selected');
                  const img = wrap.querySelector('img');
                return JSON.stringify({
                  target: 'image',
                  src: img?.getAttribute('src') || img?.src || '',
                  alt: img?.getAttribute('alt') || ''
                });
              }

              return JSON.stringify({
                target: 'editor',
                lineQuote: getLineQuoteAtPoint(x, y)
              });
            },
              cutSelectedImage() {
                const wrap = getSelectedImageWrap();
                if (!wrap || !selectNode(wrap)) return false;
                editor.focus();
                const ok = document.execCommand('cut', false, null);
                if (ok) {
                  updateEmptyState();
                  notifyChanged();
                }
                return ok;
              },
              copySelectedImage() {
                const wrap = getSelectedImageWrap();
                if (!wrap || !selectNode(wrap)) return false;
                editor.focus();
                return document.execCommand('copy', false, null);
              },
              deleteSelectedImage() {
                const wrap = getSelectedImageWrap();
                if (!wrap) return false;
                const ok = deleteNodeWithUndo(wrap);
                if (ok) {
                  updateEmptyState();
                  notifyChanged();
                }
                return ok;
              },
              replaceSelectedImage(src, alt) {
                const wrap = getSelectedImageWrap();
                if (!wrap) return false;
                const img = wrap.querySelector('img');
                if (!img) return false;
                const safeSrc = String(src || '').trim();
                if (!safeSrc) return false;
                img.src = safeSrc;
                img.setAttribute('src', safeSrc);
                img.alt = alt || '';
                img.setAttribute('alt', alt || '');
                finalizeImageSizeFromMarkup(wrap, img);
                applyDefaultImageDisplaySize(wrap, img);
                attachImageLoadHandlers(wrap, img);
                wrap.classList.add('is-selected');
                updateEmptyState();
                notifyChanged();
                return true;
              },
              focusCaretAtPoint(x, y) {
                return commitFileDropCaretAtPointImpl(x, y);
              },
              showFileDropCaretAtPoint(x, y) {
                return showFileDropCaretAtClientPoint(x, y);
              },
              commitFileDropCaretAtPoint(x, y) {
                return commitFileDropCaretAtPointImpl(x, y);
              },
              hideFileDropCaret() {
                if (imageDropCaret) imageDropCaret.style.display = 'none';
                fileDropCaretRange = null;
              },
              cancelFileDropFeedback() {
                invalidateFileDropFeedback();
              },
              setFileDropHighlight(active, hideCaret = true) {
                setFileDropHighlightActive(active, hideCaret);
              },
              scrollToHeading(id) {
                document.getElementById(id)?.scrollIntoView({ behavior: 'auto', block: 'start' });
              },
              scrollToSearchText(query, matchInContent) {
                const q = (query || '').trim();
                if (!q) return false;

                const lower = q.toLowerCase();
                const roots = matchInContent
                  ? [editor]
                  : Array.from(editor.querySelectorAll('h1')).length > 0
                    ? Array.from(editor.querySelectorAll('h1'))
                    : [editor];

                function findMatchRange(root) {
                  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
                    acceptNode(node) {
                      if (!node.textContent || !node.textContent.trim())
                        return NodeFilter.FILTER_REJECT;
                      const parent = node.parentElement;
                      if (!parent)
                        return NodeFilter.FILTER_REJECT;
                      if (parent.closest('.editor-image-wrap, .editor-image-resize-handle, .editor-file-attachment'))
                        return NodeFilter.FILTER_REJECT;
                      return NodeFilter.FILTER_ACCEPT;
                    }
                  });

                  let textNode;
                  while (textNode = walker.nextNode()) {
                    const text = textNode.textContent || '';
                    const idx = text.toLowerCase().indexOf(lower);
                    if (idx < 0)
                      continue;

                    const range = document.createRange();
                    range.setStart(textNode, idx);
                    range.setEnd(textNode, Math.min(text.length, idx + q.length));
                    return range;
                  }
                  return null;
                }

                for (const root of roots) {
                  const range = findMatchRange(root);
                  if (!range)
                    continue;

                  const sel = window.getSelection();
                  sel.removeAllRanges();
                  sel.addRange(range);

                  const rect = range.getBoundingClientRect();
                  const editorRect = editor.getBoundingClientRect();
                  const targetTop = editor.scrollTop + (rect.top - editorRect.top) - (editor.clientHeight / 3);
                  editor.scrollTop = Math.max(0, targetTop);
                  editor.focus();
                  notifyCaret();
                  return true;
                }

                editor.focus();
                return false;
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