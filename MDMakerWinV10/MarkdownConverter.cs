using Markdig;
using Markdig.Syntax;
using Markdig.Syntax.Inlines;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using System.Text;
using System.Text.RegularExpressions;

namespace MDMakerWinV10;

public record OutlineItem(int Level, string Text, int Line, int Index);

public static class MarkdownConverter
{
    static readonly MarkdownPipeline Pipeline = new MarkdownPipelineBuilder()
        .UseAbbreviations()
        .UseCitations()
        .UseCustomContainers()
        .UseDefinitionLists()
        .UseEmphasisExtras()
        .UseFigures()
        .UseFooters()
        .UseFootnotes()
        .UseGridTables()
        .UseMathematics()
        .UseMediaLinks()
        .UsePipeTables()
        .UseListExtras()
        .UseTaskLists()
        .UseReferralLinks("nofollow")
        .Build();

    public static List<OutlineItem> GetOutline(string markdown)
    {
        var doc = Markdig.Markdown.Parse(markdown, Pipeline);
        var result = new List<OutlineItem>();
        int idx = 0;
        foreach (var block in doc)
            if (block is HeadingBlock h)
                result.Add(new OutlineItem(h.Level, GetHeadingText(h), h.Line, idx++));
        return result;
    }

    // Injects sequential id="h-N" onto each heading so WebView2 can scroll to them.
    public static string ToHtmlWithAnchors(string markdown, bool numberHeadings = false)
    {
        string body = Markdig.Markdown.ToHtml(markdown, Pipeline);
        if (numberHeadings)
            body = ApplyHeadingNumbering(body);
        int i = 0;
        body = Regex.Replace(body, @"<(h[1-6])([ >])",
            m => $"<{m.Groups[1].Value} id=\"h-{i++}\"{m.Groups[2].Value}");
        return HtmlDoc(body);
    }

    // Prepends hierarchical numbers (1, 1.1, 1.1.1, …) to heading text for export output.
    static string ApplyHeadingNumbering(string html)
    {
        var counters = new int[6];
        return Regex.Replace(
            html,
            @"<(h)([1-6])([^>]*)>([\s\S]*?)</h\2>",
            m =>
            {
                int level = int.Parse(m.Groups[2].Value);
                counters[level - 1]++;
                for (int i = level; i < 6; i++)
                    counters[i] = 0;

                int start = 0;
                while (start < level - 1 && counters[start] == 0)
                    start++;

                var parts = new string[level - start];
                for (int i = start; i < level; i++)
                    parts[i - start] = counters[i].ToString();
                string prefix = string.Join(".", parts);

                return $"<{m.Groups[1].Value}{m.Groups[2].Value}{m.Groups[3].Value}>{prefix} {m.Groups[4].Value}</h{level}>";
            },
            RegexOptions.IgnoreCase);
    }

    public static string ToHtml(string markdown) =>
        HtmlDoc(ApplyHeadingNumbering(Markdig.Markdown.ToHtml(markdown, Pipeline)));

    public static string ToHtmlForPdf(string markdown) => ToHtmlWithAnchors(markdown, numberHeadings: true);

    // DOCX via AltChunk: Word opens the embedded HTML and converts it natively.
    public static void ToDocx(string markdown, string outputPath)
    {
        const string chunkId = "chunk1";
        // UTF-8 BOM helps Word detect encoding correctly
        byte[] htmlBytes = Encoding.UTF8.GetPreamble()
            .Concat(Encoding.UTF8.GetBytes(ToHtml(markdown))).ToArray();

        using var doc = WordprocessingDocument.Create(outputPath, WordprocessingDocumentType.Document);
        var main = doc.AddMainDocumentPart();
        main.Document = new Document(new Body());

        var chunk = main.AddAlternativeFormatImportPart(AlternativeFormatImportPartType.Html, chunkId);
        using var ms = new MemoryStream(htmlBytes);
        chunk.FeedData(ms);

        // Id maps to r:id in OOXML — links AltChunk to the HTML relationship
        main.Document.Body!.AppendChild(new AltChunk { Id = chunkId });
        main.Document.Save();
    }

    private static string GetHeadingText(HeadingBlock h)
    {
        var sb = new StringBuilder();
        CollectText(h.Inline, sb);
        return sb.ToString().Trim();
    }

    private static void CollectText(ContainerInline? container, StringBuilder sb)
    {
        if (container == null) return;
        foreach (var inline in container)
        {
            switch (inline)
            {
                case LiteralInline lit:   sb.Append(lit.Content.ToString()); break;
                case CodeInline code:     sb.Append(code.Content); break;
                case ContainerInline sub: CollectText(sub, sb); break;
            }
        }
    }

    // $$""" lets CSS use single-brace rules naturally; {{body}} is the one interpolation.
    static string HtmlDoc(string body) => $$"""
        <!DOCTYPE html>
        <html><head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <meta name="color-scheme" content="light">
        <style>
          html{background:#ffffff;color:#1a1a1a;color-scheme:light}
          body{font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;max-width:860px;margin:40px auto;padding:0 24px;line-height:1.7;color:#1a1a1a;background:#ffffff}
          h1,h2,h3,h4,h5,h6{margin-top:1.5em;margin-bottom:.4em;color:#111;font-weight:600}
          h1{font-size:2em;border-bottom:2px solid #e0e0e0;padding-bottom:.3em}
          h2{font-size:1.5em;border-bottom:1px solid #e0e0e0;padding-bottom:.2em}
          h3{font-size:1.2em}
          code{background:#f0f0f0;padding:.15em .4em;border-radius:3px;font-family:Consolas,'Courier New',monospace;font-size:.88em}
          pre{background:#f5f5f5;padding:1em 1.2em;border-radius:6px;overflow-x:auto;border:1px solid #e0e0e0}
          pre code{background:none;padding:0}
          blockquote{border-left:4px solid #ccc;margin:0 0 1em;padding:.5em 1em;color:#555;background:#fafafa}
          table{border-collapse:collapse;width:100%;margin:1em 0}
          th,td{border:1px solid #ddd;padding:.6em 1em;text-align:left}
          th{background:#f0f0f0;font-weight:600}
          tr:nth-child(even){background:#fafafa}
          hr{border:none;border-top:2px solid #e0e0e0;margin:2em 0}
          a{color:#0078d4;text-decoration:none}
          a:hover{text-decoration:underline}
          img{max-width:100%}
          ul,ol{padding-left:2em}
          li{margin:.2em 0}
        </style>
        </head><body>
        {{body}}
        </body></html>
        """;
}
