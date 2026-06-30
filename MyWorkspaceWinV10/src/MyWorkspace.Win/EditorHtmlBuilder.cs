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
            body = InjectHeadingIds(body);

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

    private static string WrapEditablePage(EditorChromeOptions chrome)
    {
        var p = chrome.Palette;
        var bg = ToCss(p.EditorBackground);
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

        return $$"""
        <!DOCTYPE html>
        <html lang="{{lang}}">
        <head>
          <meta charset="utf-8">
          <meta name="color-scheme" content="{{colorScheme}}">
          <style>
            html, body { height: 100%; margin: 0; }
            body {
              font-family: "Segoe UI", "Malgun Gothic", sans-serif;
              font-size: 15px; line-height: 1.75; color: {{text}};
              background: {{bg}}; overflow: hidden;
            }
            ::selection { background: {{selection}}; }
            #editor::-webkit-scrollbar { width: 10px; }
            #editor::-webkit-scrollbar-thumb {
              background: {{border}}; border-radius: 999px; border: 2px solid {{bg}};
            }
            #editor::-webkit-scrollbar-track { background: transparent; }
            #editor {
              height: 100%; box-sizing: border-box;
              padding: 24px 32px; outline: none; overflow-y: auto;
              caret-color: {{caret}};
            }
            #editor:focus { box-shadow: inset 0 0 0 1px {{focus}}; }
            #editor[data-empty="true"]:before {
              content: "{{PlaceholderToken}}";
              color: {{placeholder}}; pointer-events: none;
            }
            h1,h2,h3,h4,h5,h6 { font-weight: 600; margin: 24px 0 12px; scroll-margin-top: 12px; }
            h1 { font-size: 1.8em; border-bottom: 1px solid {{border}}; padding-bottom: 0.3em; }
            h2 { font-size: 1.5em; border-bottom: 1px solid {{borderLight}}; padding-bottom: 0.25em; }
            h3 { font-size: 1.25em; }
            h4 { font-size: 1.1em; }
            h5 { font-size: 1em; color: {{muted}}; }
            h6 { font-size: 0.95em; color: {{muted}}; text-transform: uppercase; letter-spacing: 0.02em; }
            p { margin: 0 0 14px; min-height: 1em; }
            strong, b { font-weight: 700; }
            em, i { font-style: italic; }
            s, strike, del { text-decoration: line-through; color: {{muted}}; }
            code { background: {{codeBg}}; padding: 0.15em 0.4em; border-radius: 4px; font-family: Consolas, monospace; font-size: 0.92em; }
            pre { background: {{codeBg}}; padding: 16px; border-radius: 8px; overflow-x: auto; margin: 0 0 14px; }
            pre code { background: none; padding: 0; }
            blockquote { border-left: 4px solid {{accent}}; padding: 8px 16px; color: {{muted}}; background: {{codeBg}}; margin: 0 0 14px; }
            table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
            th, td { border: 1px solid {{border}}; padding: 8px 12px; min-width: 40px; }
            th { background: {{codeBg}}; font-weight: 600; }
            ul, ol { margin: 0 0 14px; padding-left: 28px; }
            a { color: {{accent}}; text-decoration: underline; }
            img { max-width: 100%; border-radius: 4px; }
            hr { border: none; border-top: 1px solid {{border}}; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div id="editor" contenteditable="true" spellcheck="true" data-empty="true">{{BodyPlaceholder}}</div>
          <script>
            const editor = document.getElementById('editor');
            const defaultCodeText = '{{DefaultCodeToken}}';
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

            editor.addEventListener('input', () => { updateEmptyState(); notifyChanged(); });
            editor.addEventListener('keyup', (e) => {
              if (e.key === 'ContextMenu' || e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
              notifyCaretDebounced();
            });
            editor.addEventListener('click', (e) => { if (e.button === 0) notifyCaretDebounced(); });
            editor.addEventListener('focus', ensureParagraph);
            editor.addEventListener('compositionend', () => { updateEmptyState(); notifyChanged(); });
            editor.addEventListener('contextmenu', (e) => { e.preventDefault(); });

            editor.addEventListener('keydown', (e) => {
              if (e.ctrlKey || e.metaKey) {
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
            });

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
                updateEmptyState();
                notifyChanged();
              },
              createLink(url) {
                editor.focus();
                if (!url) return;
                const sel = window.getSelection();
                if (!sel || !sel.toString()) {
                  document.execCommand('insertHTML', false, '<a href="' + escapeHtml(url) + '">' + escapeHtml(url) + '</a>');
                } else {
                  document.execCommand('createLink', false, url);
                }
                updateEmptyState();
                notifyChanged();
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
              }
            };

            updateEmptyState();
            window.addEventListener('load', () => placeCaretAtEnd(editor));
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