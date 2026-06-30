using Markdig;

namespace MyWorkspace.Win;

internal static class PreviewHtmlBuilder
{
    public static string Build(string title, string markdown, MarkdownPipeline pipeline, EditorChromeOptions? chrome = null)
    {
        chrome ??= EditorChromeOptions.CreateCurrent();
        var body = Markdown.ToHtml(markdown, pipeline);
        if (string.IsNullOrWhiteSpace(body))
            body = "<p></p>";

        var safeTitle = System.Net.WebUtility.HtmlEncode(string.IsNullOrWhiteSpace(title)
            ? Localization.Get(K.UntitledPageTitle)
            : title.Trim());

        var p = chrome.Palette;
        var bg = ToCss(p.EditorBackground);
        var text = ToCss(p.EditorText);
        var border = ToCss(p.Border);
        var borderLight = ToCss(p.BorderLight);
        var accent = ToCss(p.Accent);
        var muted = ToCss(p.TextSecondary);
        var codeBg = ToCss(p.EditorCodeBackground);
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
                code { background: {{codeBg}}; padding: 0.15em 0.4em; border-radius: 4px; font-family: Consolas, monospace; }
                pre { background: {{codeBg}}; padding: 16px; border-radius: 8px; overflow-x: auto; }
                blockquote { border-left: 4px solid {{accent}}; padding: 8px 16px; color: {{muted}}; background: {{codeBg}}; }
                table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
                th, td { border: 1px solid {{border}}; padding: 8px 12px; }
                th { background: {{codeBg}}; }
                img { max-width: 100%; border-radius: 4px; }
                a { color: {{accent}}; }
              </style>
            </head>
            <body>
              <h1>{{safeTitle}}</h1>
              {{body}}
            </body>
            </html>
            """;
    }

    private static string ToCss(Color color) =>
        $"#{color.R:X2}{color.G:X2}{color.B:X2}";
}
