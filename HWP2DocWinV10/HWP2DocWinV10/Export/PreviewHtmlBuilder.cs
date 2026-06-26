using Markdig;
using System.Globalization;
using System.Text.RegularExpressions;

namespace HWP2DocWinV10.Export;

internal static class PreviewHtmlBuilder
{
    private static readonly MarkdownPipeline Pipeline = new MarkdownPipelineBuilder()
        .UseAdvancedExtensions()
        .UseAutoLinks()
        .UseSoftlineBreakAsHardlineBreak()
        .Build();

    public static string BuildFullPage(string markdown, string? assetDirectory, float fontSizePt = AppUserSettings.DefaultFontSize)
    {
        return BuildRenderedPage(markdown, assetDirectory, fontSizePt, forExport: false, useVirtualHost: true);
    }

    public static string BuildEditorPage(string markdown, float fontSizePt = AppUserSettings.DefaultFontSize)
    {
        string safeText = EncodeHtmlText(markdown);
        string body = $"""<textarea id="editor" class="markdown-editor" rows="1" spellcheck="false" autocomplete="off">{safeText}</textarea>""";
        return WrapPage(body, fontSizePt, forExport: false, isEditor: true);
    }

    public static string BuildForExport(string markdown, string? assetDirectory, float fontSizePt)
    {
        return BuildRenderedPage(markdown, assetDirectory, fontSizePt, forExport: true, useVirtualHost: false);
    }

    public static string BuildForPdfExport(string markdown, string? assetDirectory, float fontSizePt)
    {
        return BuildRenderedPage(markdown, assetDirectory, fontSizePt, forExport: true, useVirtualHost: true);
    }

    private static string BuildRenderedPage(
        string markdown,
        string? assetDirectory,
        float fontSizePt,
        bool forExport,
        bool useVirtualHost)
    {
        string normalized = MarkdownPreviewNormalizer.Normalize(markdown);
        normalized = useVirtualHost
            ? MarkdownAssetPathResolver.RewriteMarkdownImagesForVirtualHost(normalized, assetDirectory)
            : MarkdownAssetPathResolver.RewriteMarkdownImages(normalized, assetDirectory);

        string anchored = MarkdownLineAnchorInjector.Inject(normalized);
        string body = Markdown.ToHtml(anchored, Pipeline);
        body = useVirtualHost
            ? MarkdownAssetPathResolver.RewriteHtmlImagesForVirtualHost(body, assetDirectory)
            : MarkdownAssetPathResolver.RewriteHtmlImages(body, assetDirectory);

        body = WrapHtmlTables(body);
        if (forExport)
            body = ApplyExportFontStyles(body, fontSizePt);

        return WrapPage(body, fontSizePt, forExport, isEditor: false);
    }

    private static string EncodeHtmlText(string text)
    {
        if (string.IsNullOrEmpty(text))
            return string.Empty;

        return text
            .Replace("&", "&amp;", StringComparison.Ordinal)
            .Replace("<", "&lt;", StringComparison.Ordinal)
            .Replace(">", "&gt;", StringComparison.Ordinal);
    }

    private static string ApplyExportFontStyles(string html, float fontSizePt)
    {
        string style = BuildExportFontStyle(fontSizePt);

        foreach (string tag in new[] { "p", "li", "blockquote" })
            html = InjectInlineStyle(html, tag, style);

        return html;
    }

    private static string BuildExportFontStyle(float fontSizePt)
        => $"font-size:{fontSizePt.ToString("0.##", CultureInfo.InvariantCulture)}pt;" +
           "font-family:'Malgun Gothic','Segoe UI',sans-serif;";

    private static string InjectInlineStyle(string html, string tagName, string style)
    {
        return Regex.Replace(
            html,
            $@"<{tagName}\b(?![^>]*\bstyle=)([^>]*)>",
            $"<{tagName}$1 style=\"{style}\">",
            RegexOptions.IgnoreCase);
    }

    private static string WrapHtmlTables(string html)
    {
        return Regex.Replace(
            html,
            @"(?<!<div class=""table-wrap"">)<table\b",
            "<div class=\"table-wrap\"><table",
            RegexOptions.IgnoreCase);
    }

    private static string WrapPage(string body, float fontSizePt, bool forExport, bool isEditor)
    {
        body = Regex.Replace(
            body,
            @"</table>",
            "</table></div>",
            RegexOptions.IgnoreCase);

        string fontSizeCss = fontSizePt.ToString("0.##", CultureInfo.InvariantCulture);
        string bodyInlineStyle = forExport
            ? $" style=\"font-size:{fontSizeCss}pt;font-family:'Malgun Gothic','Segoe UI',sans-serif;\""
            : string.Empty;
        string articleInlineStyle = forExport
            ? $" style=\"font-size:{fontSizeCss}pt;font-family:'Malgun Gothic','Segoe UI',sans-serif;color:#1f2937;\""
            : string.Empty;
        string wordCompatHead = forExport
            ? """
              <!--[if gte mso 9]>
              <xml>
                <w:WordDocument xmlns:w="urn:schemas-microsoft-com:office:word">
                  <w:View>Print</w:View>
                </w:WordDocument>
              </xml>
              <![endif]-->
              """
            : string.Empty;
        string printFontRule = forExport
            ? $"                  .markdown-body {{ font-size: {fontSizeCss}pt !important; }}"
            : string.Empty;
        string shellStyles = forExport
            ? """
                body {
                  padding: 24px 16px 32px;
                }
              """
            : """
                html {
                  height: 100%;
                  overflow-y: auto;
                }
                body {
                  min-height: 100%;
                  display: flex;
                  flex-direction: column;
                  padding: 12px 10px 12px;
                }
                .page {
                  flex: 1 1 auto;
                  min-height: 100%;
                  display: flex;
                  flex-direction: column;
                }
                .markdown-body {
                  flex: 1 1 auto;
                  min-height: 100%;
                }
              """;
        string editorStyles = isEditor
            ? """
                article.markdown-body.is-editor {
                  display: flex;
                  flex-direction: column;
                  min-height: 100%;
                }
                textarea.markdown-editor {
                  display: block;
                  width: 100%;
                  flex: 1 1 auto;
                  min-height: 100%;
                  border: none;
                  outline: none;
                  padding: 0;
                  margin: 0;
                  background: transparent;
                  color: inherit;
                  font: inherit;
                  line-height: inherit;
                  letter-spacing: inherit;
                  white-space: pre-wrap;
                  word-wrap: break-word;
                  overflow: hidden;
                  resize: none;
                }
              """
            : string.Empty;
        string editorScript = isEditor
            ? """
              <script>
              (function () {
                const editor = document.getElementById('editor');
                if (!editor) return;

                const syncEditorHeight = () => {
                  if (editor.value.length === 0) {
                    editor.style.height = '';
                    return;
                  }

                  editor.style.height = '0px';
                  editor.style.height = `${editor.scrollHeight}px`;
                };

                window.hwp2docSetReadOnly = (readOnly) => {
                  editor.readOnly = !!readOnly;
                };

                window.hwp2docGoToLine = (lineIndex) => {
                  const lines = editor.value.split(/\n/);
                  if (lineIndex < 0 || lineIndex >= lines.length) return false;
                  let start = 0;
                  for (let i = 0; i < lineIndex; i++) start += lines[i].length + 1;
                  const end = start + lines[lineIndex].length;
                  editor.focus();
                  editor.setSelectionRange(start, end);
                  syncEditorHeight();
                  const style = window.getComputedStyle(editor);
                  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.8;
                  const lineTopInEditor = lineIndex * lineHeight;
                  const editorTop = editor.getBoundingClientRect().top + window.scrollY;
                  const absoluteLineTop = editorTop + lineTopInEditor;
                  window.scrollTo({
                    top: Math.max(0, absoluteLineTop - 20),
                    behavior: 'smooth'
                  });
                  return true;
                };

                editor.addEventListener('input', () => {
                  syncEditorHeight();
                  if (window.chrome && window.chrome.webview) {
                    window.chrome.webview.postMessage({ type: 'textChanged', text: editor.value });
                  }
                });

                document.querySelector('.markdown-body')?.addEventListener('mousedown', (event) => {
                  if (event.target !== editor) {
                    editor.focus();
                  }
                });

                window.hwp2docSyncLayout = syncEditorHeight;
                window.addEventListener('resize', syncEditorHeight);

                syncEditorHeight();
              })();
              </script>
              """
            : string.Empty;

        string articleClass = isEditor ? "markdown-body is-editor" : "markdown-body";

        return $$"""
            <!DOCTYPE html>
            <html lang="ko">
            <head>
              <meta charset="utf-8">
              <meta name="color-scheme" content="light">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <title>HWP2Doc</title>
              {{wordCompatHead}}
              <style>
                * { box-sizing: border-box; }
                html { background: #f3f4f6; }
                body {
                  margin: 0;
                  background: #f3f4f6;
                  -webkit-font-smoothing: antialiased;
                  text-rendering: optimizeLegibility;
                }
            {{shellStyles}}
                .page {
                  width: 100%;
                  max-width: 920px;
                  margin: 0 auto;
                  background: #ffffff;
                  border: 1px solid #e5e7eb;
                  border-radius: 14px;
                  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
                  padding: 40px 48px 48px;
                }
                .markdown-body {
                  color: #1f2937;
                  font-family: "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
                  font-size: {{fontSizeCss}}pt;
                  line-height: 1.8;
                  word-wrap: break-word;
                }
                .markdown-body > :first-child { margin-top: 0 !important; }
                .markdown-body > :last-child { margin-bottom: 0 !important; }
                .markdown-body .md-line-anchor {
                  display: block;
                  height: 0;
                  scroll-margin-top: 20px;
                }
                .markdown-body h1,
                .markdown-body h2,
                .markdown-body h3,
                .markdown-body h4,
                .markdown-body h5,
                .markdown-body h6 {
                  font-weight: 700;
                  line-height: 1.35;
                  letter-spacing: -0.02em;
                  color: #111827;
                }
                .markdown-body h1 {
                  font-size: 1.9em;
                  margin: 0 0 20px;
                  padding-bottom: 0.35em;
                  border-bottom: 2px solid #e5e7eb;
                }
                .markdown-body h2 {
                  font-size: 1.55em;
                  margin: 32px 0 16px;
                  padding-bottom: 0.28em;
                  border-bottom: 1px solid #e5e7eb;
                }
                .markdown-body h3 { font-size: 1.28em; margin: 28px 0 12px; }
                .markdown-body h4 { font-size: 1.12em; margin: 24px 0 10px; color: #374151; }
                .markdown-body h5 { font-size: 1.02em; margin: 20px 0 8px; color: #374151; }
                .markdown-body h6 { font-size: 0.95em; margin: 18px 0 8px; color: #6b7280; }
                .markdown-body p { margin: 0 0 14px; }
                .markdown-body strong { font-weight: 700; color: #111827; }
                .markdown-body em { font-style: italic; }
                .markdown-body del { color: #6b7280; }
                .markdown-body a {
                  color: #2563eb;
                  text-decoration: none;
                  font-weight: 500;
                }
                .markdown-body a:hover { text-decoration: underline; }
                .markdown-body ul,
                .markdown-body ol {
                  margin: 0 0 16px;
                  padding-left: 1.6em;
                }
                .markdown-body li { margin: 6px 0; }
                .markdown-body li::marker { color: #6b7280; }
                .markdown-body li > p { margin-bottom: 8px; }
                .markdown-body li > ul,
                .markdown-body li > ol { margin-top: 6px; margin-bottom: 6px; }
                .markdown-body blockquote {
                  margin: 0 0 18px;
                  padding: 12px 18px;
                  color: #4b5563;
                  background: #f8fafc;
                  border-left: 4px solid #2563eb;
                  border-radius: 0 10px 10px 0;
                }
                .markdown-body blockquote > :last-child { margin-bottom: 0; }
                .markdown-body hr {
                  height: 0;
                  border: none;
                  border-top: 1px solid #e5e7eb;
                  margin: 28px 0;
                }
                .markdown-body code {
                  font-family: "Cascadia Mono", Consolas, "Malgun Gothic", monospace;
                  font-size: 0.92em;
                  background: #f3f4f6;
                  border: 1px solid #e5e7eb;
                  border-radius: 6px;
                  padding: 0.12em 0.4em;
                }
                .markdown-body pre {
                  margin: 0 0 18px;
                  padding: 16px 18px;
                  overflow: auto;
                  background: #0f172a;
                  color: #e2e8f0;
                  border-radius: 12px;
                  border: 1px solid #1e293b;
                }
                .markdown-body pre code {
                  background: transparent;
                  border: none;
                  padding: 0;
                  color: inherit;
                  font-size: 0.88em;
                }
                .markdown-body .table-wrap {
                  overflow-x: auto;
                  margin: 0 0 20px;
                  border: 1px solid #e5e7eb;
                  border-radius: 12px;
                }
                .markdown-body table {
                  width: 100%;
                  border-collapse: collapse;
                  margin: 0;
                  font-size: 0.95em;
                }
                .markdown-body th,
                .markdown-body td {
                  border: 1px solid #e5e7eb;
                  padding: 10px 14px;
                  vertical-align: top;
                  text-align: left;
                }
                .markdown-body th {
                  background: #f8fafc;
                  font-weight: 700;
                  color: #111827;
                }
                .markdown-body tr:nth-child(even) td { background: #fcfcfd; }
                .markdown-body img {
                  max-width: 100%;
                  height: auto;
                  margin: 8px 0 16px;
                  border-radius: 10px;
                  border: 1px solid #e5e7eb;
                  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);
                }
                .markdown-body input[type="checkbox"] {
                  margin-right: 0.45em;
                  transform: translateY(1px);
                }
            {{editorStyles}}
                @media print {
                  html, body { background: #ffffff; padding: 0; }
                  .page {
                    max-width: none;
                    border: none;
                    border-radius: 0;
                    box-shadow: none;
                    padding: 16px 24px;
                  }
                  .markdown-body pre,
                  .markdown-body blockquote,
                  .markdown-body .table-wrap { break-inside: avoid; }
            {{printFontRule}}
                }
              </style>
            </head>
            <body{{bodyInlineStyle}}>
              <main class="page">
                <article class="{{articleClass}}"{{articleInlineStyle}}>
            {{body}}
                </article>
              </main>
            {{editorScript}}
            </body>
            </html>
            """;
    }
}
