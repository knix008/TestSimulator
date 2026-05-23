using Markdig;
using System.Text.RegularExpressions;

namespace EasyMDV10;

/// <summary>
/// 미리보기 창과 동일한 전체 HTML 문서를 생성합니다.
/// HTML / Word / PDF보내기에서 공통으로 사용합니다.
/// </summary>
internal static class PreviewHtmlBuilder
{
    public static string BuildFullPage(string markdown, MarkdownPipeline pipeline)
    {
        string body = Markdown.ToHtml(markdown, pipeline);
        body = InjectHeadingIds(body);
        return WrapPage(body);
    }

    private static string InjectHeadingIds(string html)
    {
        int headingIndex = 0;
        return Regex.Replace(
            html,
            "<h([1-6])([^>]*)>",
            m =>
            {
                string level = m.Groups[1].Value;
                string attrs = m.Groups[2].Value;
                headingIndex++;
                attrs = Regex.Replace(attrs, @"\sid\s*=\s*(""[^""]*""|'[^']*')", "", RegexOptions.IgnoreCase);
                return $"<h{level}{attrs} id=\"outline-heading-{headingIndex}\">";
            });
    }

    internal static string WrapPage(string body) => $$"""
        <!DOCTYPE html>
        <html lang="ko">
        <head>
          <meta charset="utf-8">
          <meta name="color-scheme" content="light">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>EasyMD</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: "Segoe UI", "Malgun Gothic", -apple-system, BlinkMacSystemFont, sans-serif;
              font-size: 15px; line-height: 1.75; color: #1f2328;
              padding: 28px 36px 40px; background: #ffffff;
              -webkit-font-smoothing: antialiased;
            }
            h1,h2,h3,h4,h5,h6 {
              font-weight: 600; margin: 28px 0 14px; line-height: 1.35;
              letter-spacing: -0.02em; color: #1f2328;
            }
            h1 { font-size: 1.875em; padding-bottom: 0.35em; border-bottom: 1px solid #d8dee4; }
            h2 { font-size: 1.5em; padding-bottom: 0.3em; border-bottom: 1px solid #eaeef2; }
            h3 { font-size: 1.25em; }
            p { margin: 0 0 16px; }
            a { color: #0969da; text-decoration: none; font-weight: 500; }
            a:hover { text-decoration: underline; }
            code {
              font-family: "Cascadia Mono", Consolas, monospace;
              font-size: 0.9em; background: #f6f8fa;
              padding: 0.15em 0.45em; border-radius: 6px;
              border: 1px solid #d0d7de;
            }
            pre {
              background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 10px;
              padding: 18px 20px; overflow-x: auto; margin: 0 0 18px;
              box-shadow: inset 0 1px 0 rgba(255,255,255,0.6);
            }
            pre code { background: none; border: none; padding: 0; font-size: 0.875em; }
            blockquote {
              border-left: 4px solid #0969da; margin: 0 0 18px;
              padding: 10px 18px; color: #57606a; background: #f6f8fa;
              border-radius: 0 8px 8px 0;
            }
            ul, ol { margin: 0 0 16px; padding-left: 1.75em; }
            li { margin: 6px 0; }
            li::marker { color: #57606a; }
            table {
              border-collapse: separate; border-spacing: 0; width: 100%;
              margin: 0 0 18px; border: 1px solid #d0d7de; border-radius: 10px;
              overflow: hidden;
            }
            th, td { border-bottom: 1px solid #d0d7de; border-right: 1px solid #d0d7de; padding: 10px 14px; }
            th:last-child, td:last-child { border-right: none; }
            tr:last-child td { border-bottom: none; }
            th { background: #f6f8fa; font-weight: 600; text-align: left; }
            tr:nth-child(even) td { background: #fafbfc; }
            img { max-width: 100%; border-radius: 8px; box-shadow: 0 1px 3px rgba(27,31,36,0.12); }
            hr { border: none; border-top: 1px solid #d8dee4; margin: 28px 0; }
            del { color: #6e7781; }
            strong { font-weight: 600; }
            @media print {
              body { padding: 16px 24px 24px; }
              a { color: #0969da; }
              pre, blockquote, table { break-inside: avoid; }
            }
          </style>
        </head>
        <body>{{body}}</body>
        </html>
        """;
}
