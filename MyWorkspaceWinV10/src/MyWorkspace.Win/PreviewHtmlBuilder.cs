using Markdig;
using System.Text.RegularExpressions;

namespace MyWorkspace.Win;

internal static partial class PreviewHtmlBuilder
{
    [GeneratedRegex(@"<a\b(?<attrs>[^>]*?\shref=[""'](?<href>[^""']+)[""'][^>]*)>", RegexOptions.IgnoreCase)]
    private static partial Regex ExportFileLinkRegex();

    public static string Build(string title, string markdown, MarkdownPipeline pipeline, string? resourceBaseDirectory = null, EditorChromeOptions? chrome = null, int? pdfPageId = null, bool pdfInlineAllImages = false)
    {
        chrome ??= EditorChromeOptions.CreateCurrent();
        var body = Markdown.ToHtml(markdown, pipeline);
        if (string.IsNullOrWhiteSpace(body))
            body = "<p></p>";
        else
        {
            body = EnhanceExportBody(body);
            if (pdfInlineAllImages)
                body = PdfExportImageInliner.InlineAllImages(body);
            else if (pdfPageId.HasValue)
                body = PdfExportImageInliner.InlineImages(body, pdfPageId.Value);
        }

        var safeTitle = System.Net.WebUtility.HtmlEncode(string.IsNullOrWhiteSpace(title)
            ? Localization.Get(K.UntitledPageTitle)
            : title.Trim());

        var baseTag = string.Empty;
        if (!string.IsNullOrWhiteSpace(resourceBaseDirectory))
        {
            var baseUri = new Uri(Path.GetFullPath(resourceBaseDirectory) + Path.DirectorySeparatorChar).AbsoluteUri;
            baseTag = $"""<base href="{baseUri}">""";
        }

        var p = chrome.Palette;
        var bg = ToCss(p.Sidebar);
        var text = ToCss(p.EditorText);
        var border = ToCss(p.Border);
        var borderLight = ToCss(p.BorderLight);
        var accent = ToCss(p.Accent);
        var muted = ToCss(p.TextSecondary);
        var codeBg = ToCss(p.EditorCodeBackground);
        var surface = ToCss(p.Surface);
        var lang = Localization.Current == AppLanguage.Korean ? "ko" : "en";
        var colorScheme = AppTheme.IsDark ? "dark" : "light";
        var bodyFontSize = (15F * chrome.FontScaleFactor).ToString("0.#", System.Globalization.CultureInfo.InvariantCulture);

        return $$"""
            <!DOCTYPE html>
            <html lang="{{lang}}">
            <head>
              <meta charset="utf-8">
              <meta name="color-scheme" content="{{colorScheme}}">
              {{baseTag}}
              <style>
                html, body { margin: 0; }
                body {
                  font-family: "Segoe UI", "Malgun Gothic", sans-serif;
                  font-size: {{bodyFontSize}}px; line-height: 1.75; color: {{text}};
                  background: {{bg}}; padding: 32px 40px;
                }
                h1, h2, h3, h4, h5, h6 { display: block; width: 100%; box-sizing: border-box; color: {{text}}; }
                h1 { font-size: 1.8em; border-bottom: none; padding-bottom: 0.3em; margin-top: 0; }
                h1::after { content: ""; display: block; border-bottom: 1px solid {{border}}; margin: 0.3em -40px 0; }
                h2 { font-size: 1.5em; border-bottom: none; padding-bottom: 0.25em; }
                h2::after { content: ""; display: block; border-bottom: 1px solid {{borderLight}}; margin: 0.25em -40px 0; }
                h3 { font-size: 1.25em; }
                h4 { font-size: 1.1em; }
                h5 { font-size: 1em; }
                h6 { font-size: 0.95em; text-transform: uppercase; letter-spacing: 0.02em; }
                h1 a, h2 a, h3 a, h4 a, h5 a, h6 a { color: {{accent}}; }
                code { background: {{codeBg}}; padding: 0.15em 0.4em; border-radius: 4px; font-family: Consolas, "Cascadia Mono", monospace; color: {{text}}; border: 1px solid {{border}}; }
                pre { background: {{codeBg}}; padding: 16px; border-radius: 8px; overflow-x: auto; border: 1px solid {{border}}; }
                pre code { border: none; background: none; }
                blockquote { border-left: 4px solid {{accent}}; padding: 8px 16px; color: {{muted}}; background: {{codeBg}}; border: 1px solid {{borderLight}}; border-left-width: 4px; }
                table { border-collapse: collapse; width: 100%; margin-bottom: 16px; border: 1px solid {{border}}; }
                th, td { border: 1px solid {{border}}; padding: 8px 12px; }
                th { background: {{codeBg}}; font-weight: 600; }
                td { background: color-mix(in srgb, {{surface}} 72%, {{bg}}); }
                tbody tr:nth-child(even) td { background: color-mix(in srgb, {{codeBg}} 82%, {{bg}}); }
                img { max-width: 100%; height: auto; border-radius: 4px; margin: 8px 0; }
                img[width] { max-width: none; }
                a { color: {{accent}}; }
                a.file-attachment {
                  display: inline-flex; align-items: center; gap: 8px;
                  padding: 8px 12px; margin: 8px 0;
                  border: 1px solid {{border}}; border-radius: 6px;
                  background: {{codeBg}}; color: {{text}} !important;
                  text-decoration: none !important;
                }
                a.file-attachment::before {
                  content: "📎"; font-size: 1em; line-height: 1;
                }
              </style>
            </head>
            <body>
              <h1>{{safeTitle}}</h1>
              {{body}}
            </body>
            </html>
            """;
    }

    private static string EnhanceExportBody(string html) =>
        ExportFileLinkRegex().Replace(html, match =>
        {
            var href = match.Groups["href"].Value;
            var attrs = match.Groups["attrs"].Value;
            if (attrs.Contains("file-attachment", StringComparison.OrdinalIgnoreCase))
                return match.Value;

            if (href.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                href.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                if (!href.Contains(PageAssetStore.EditorAssetHost, StringComparison.OrdinalIgnoreCase))
                    return match.Value;
            }
            else if (href.StartsWith("mailto:", StringComparison.OrdinalIgnoreCase))
            {
                return match.Value;
            }

            return $"""<a class="file-attachment"{attrs}>""";
        });

    private static string ToCss(Color color) =>
        $"#{color.R:X2}{color.G:X2}{color.B:X2}";
}
