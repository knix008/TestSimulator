
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
    // One numbering token at the start of heading text: 1, 1.2, 1), 1.), (1), 1, etc.
    static readonly Regex HeadingNumberTokenRx = new(
        """
        ^(?:
            \(\s*\d+(?:\.\d+)*\s*\)
          | \d+(?:\.\d+)*[.).,;:]+
          | \d+(?:\.\d+)*\.
          | \d+(?:\.\d+)*
        )\s+
        """,
        RegexOptions.Compiled | RegexOptions.IgnorePatternWhitespace | RegexOptions.CultureInvariant);

    // 마크다운 원본에 계층적 번호를 붙여 반환 (H1, H2, H3 ...)
    public static string ApplyHeadingNumberingToMarkdown(string markdown)
    {
        var lines = markdown.Split('\n');
        var counters = new int[6];
        var sb = new StringBuilder();
        foreach (var line in lines)
        {
            var m = Regex.Match(line, "^(#{1,6})\\s+(.*)");
            if (m.Success)
            {
                int level = m.Groups[1].Value.Length;
                counters[level - 1]++;
                for (int i = level; i < 6; i++) counters[i] = 0;
                int start = 0;
                while (start < level - 1 && counters[start] == 0) start++;
                var parts = new string[level - start];
                for (int i = start; i < level; i++) parts[i - start] = counters[i].ToString();
                string prefix = string.Join(".", parts);
                string title = StripLeadingNumberPrefix(m.Groups[2].Value);
                sb.AppendLine($"{m.Groups[1].Value} {prefix} {title}");
            }
            else
            {
                sb.AppendLine(line);
            }
        }
        return sb.ToString();
    }

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

    public static List<OutlineItem> GetOutline(string markdown, bool numberHeadings = false)
    {
        var doc = Markdig.Markdown.Parse(markdown, Pipeline);
        var result = new List<OutlineItem>();
        var counters = new int[6];
        int idx = 0;
        foreach (var block in doc)
        {
            if (block is not HeadingBlock h) continue;
            string title = StripLeadingNumberPrefix(GetHeadingText(h));
            if (numberHeadings)
            {
                int level = h.Level;
                counters[level - 1]++;
                for (int i = level; i < 6; i++) counters[i] = 0;
                int start = 0;
                while (start < level - 1 && counters[start] == 0) start++;
                var parts = new string[level - start];
                for (int i = start; i < level; i++) parts[i - start] = counters[i].ToString();
                title = $"{string.Join(".", parts)} {title}";
            }
            result.Add(new OutlineItem(h.Level, title, h.Line, idx++));
        }
        return result;
    }

    // Screen preview: export formatting + optional heading anchors for outline navigation.
    public static string ToHtmlWithAnchors(string markdown, PdfSettings? settings = null)
    {
        settings ??= new PdfSettings();
        string src = settings.NumberHeadings ? StripHeadingNumbers(markdown) : markdown;
        string body = Markdig.Markdown.ToHtml(src, Pipeline);
        if (settings.NumberHeadings) body = ApplyHeadingNumbering(body);
        int i = 0;
        body = Regex.Replace(body, @"<(h[1-6])([ >])",
            m => $"<{m.Groups[1].Value} id=\"h-{i++}\"{m.Groups[2].Value}");
        return HtmlDoc(body, settings, forPrint: false);
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

                string title = StripLeadingNumberPrefix(m.Groups[4].Value.Trim());
                return $"<{m.Groups[1].Value}{m.Groups[2].Value}{m.Groups[3].Value}>{prefix} {title}</h{level}>";
            },
            RegexOptions.IgnoreCase);
    }

    public static string ToHtml(string markdown, PdfSettings? settings = null)
    {
        settings ??= new PdfSettings();
        string src = settings.NumberHeadings ? StripHeadingNumbers(markdown) : markdown;
        string body = Markdig.Markdown.ToHtml(src, Pipeline);
        if (settings.NumberHeadings) body = ApplyHeadingNumbering(body);
        return HtmlDoc(body, settings, forPrint: false);
    }

    public static string ToHtmlForPdf(string markdown, PdfSettings? settings = null)
    {
        settings ??= new PdfSettings();
        string src = settings.NumberHeadings ? StripHeadingNumbers(markdown) : markdown;
        string body = Markdig.Markdown.ToHtml(src, Pipeline);
        if (settings.NumberHeadings) body = ApplyHeadingNumbering(body);
        int i = 0;
        body = Regex.Replace(body, @"<(h[1-6])([ >])",
            m => $"<{m.Groups[1].Value} id=\"h-{i++}\"{m.Groups[2].Value}");
        return HtmlDoc(body, settings, forPrint: true);
    }

    // Removes heading numbers after #, ##, ### … (including accumulated 1 1.2 1.2.3 prefixes).
    public static string StripHeadingNumbers(string markdown) =>
        Regex.Replace(markdown, @"^(#{1,6})\s+(.*)$", m =>
        {
            string title = StripLeadingNumberPrefix(m.Groups[2].Value.TrimEnd('\r'));
            return string.IsNullOrEmpty(title) ? m.Groups[1].Value : $"{m.Groups[1].Value} {title}";
        }, RegexOptions.Multiline);

    static string StripLeadingNumberPrefix(string text)
    {
        text = text.TrimStart();
        int prevLen;
        do
        {
            prevLen = text.Length;
            text = HeadingNumberTokenRx.Replace(text, "");
            text = text.TrimStart();
        } while (text.Length < prevLen && text.Length > 0);
        return text;
    }

    // Strips existing numbers then re-applies sequential numbering to the whole document.
    public static string RenumberHeadings(string markdown) =>
        ApplyHeadingNumberingToMarkdown(StripHeadingNumbers(markdown));

    // DOCX via AltChunk: Word opens the embedded HTML and converts it natively.
    public static void ToDocx(string markdown, string outputPath, PdfSettings? settings = null)
    {
        const string chunkId = "chunk1";
        settings ??= new PdfSettings();
        // UTF-8 BOM helps Word detect encoding correctly
        byte[] htmlBytes = Encoding.UTF8.GetPreamble()
            .Concat(Encoding.UTF8.GetBytes(ToHtml(markdown, settings))).ToArray();

        using var doc = WordprocessingDocument.Create(outputPath, WordprocessingDocumentType.Document);
        var main = doc.AddMainDocumentPart();
        main.Document = new Document(new Body());

        var chunk = main.AddAlternativeFormatImportPart(AlternativeFormatImportPartType.Html, chunkId);
        using var ms = new MemoryStream(htmlBytes);
        chunk.FeedData(ms);

        // Id maps to r:id in OOXML — links AltChunk to the HTML relationship
        main.Document.Body!.AppendChild(new AltChunk { Id = chunkId });
        AddDocxPageNumbers(main, settings.PageNumbers);
        main.Document.Save();
    }

    static void AddDocxPageNumbers(MainDocumentPart main, PageNumberPosition pos)
    {
        if (pos == PageNumberPosition.None) return;

        bool isTop = pos >= PageNumberPosition.TopLeft;
        JustificationValues align = pos switch
        {
            PageNumberPosition.BottomCenter or PageNumberPosition.TopCenter => JustificationValues.Center,
            PageNumberPosition.BottomRight  or PageNumberPosition.TopRight  => JustificationValues.Right,
            _ => JustificationValues.Left,
        };

        var para = new Paragraph();
        para.Append(new ParagraphProperties(new Justification { Val = align }));
        para.Append(new Run(new FieldChar { FieldCharType = FieldCharValues.Begin }));
        para.Append(new Run(new FieldCode(" PAGE ")));
        para.Append(new Run(new FieldChar { FieldCharType = FieldCharValues.Separate }));
        para.Append(new Run(new Text("1")));
        para.Append(new Run(new FieldChar { FieldCharType = FieldCharValues.End }));

        var sectPr = new SectionProperties();
        if (isTop)
        {
            var part = main.AddNewPart<HeaderPart>();
            part.Header = new Header(para);
            part.Header.Save();
            sectPr.Append(new HeaderReference { Type = HeaderFooterValues.Default, Id = main.GetIdOfPart(part) });
        }
        else
        {
            var part = main.AddNewPart<FooterPart>();
            part.Footer = new Footer(para);
            part.Footer.Save();
            sectPr.Append(new FooterReference { Type = HeaderFooterValues.Default, Id = main.GetIdOfPart(part) });
        }
        main.Document!.Body!.AppendChild(sectPr);
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

    static string HtmlDoc(string body, PdfSettings? settings = null, bool forPrint = false)
    {
        if (settings == null)
            return HtmlDocPreview(body);

        var ic = System.Globalization.CultureInfo.InvariantCulture;
        string ff = settings.FontFamily;
        string fs = settings.FontSizePt.ToString("0.##", ic);
        string lh = settings.LineHeight.ToString("0.##", ic);
        string ps = settings.ParagraphSpacingEm.ToString("0.##", ic);
        string bodyLayout = forPrint
            ? "margin:0;padding:0"
            : "max-width:860px;margin:40px auto;padding:0 24px";
        string headingBreak = forPrint ? "page-break-after:avoid;" : "";
        string blockBreak   = forPrint ? "page-break-inside:avoid;" : "";

        // CSS @page margin-box page numbers (Chrome 128+ / modern WebView2)
        string pageNumSelector = settings.PageNumbers switch
        {
            PageNumberPosition.BottomLeft   => "@bottom-left",
            PageNumberPosition.BottomCenter => "@bottom-center",
            PageNumberPosition.BottomRight  => "@bottom-right",
            PageNumberPosition.TopLeft      => "@top-left",
            PageNumberPosition.TopCenter    => "@top-center",
            PageNumberPosition.TopRight     => "@top-right",
            _                               => "",
        };
        string pageNumCss = pageNumSelector == "" ? ""
            : $"\n  @page{{{pageNumSelector}{{content:counter(page);font-family:{ff};font-size:9pt;color:#555}}}}";
        return $$"""
            <!DOCTYPE html>
            <html><head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <meta name="color-scheme" content="light">
            <style>
              html{background:#fff;color:#1a1a1a;color-scheme:light}
              body{font-family:{{ff}};font-size:{{fs}}pt;line-height:{{lh}};{{bodyLayout}};color:#1a1a1a;background:#fff}
              p{margin-top:0;margin-bottom:{{ps}}em}
              h1,h2,h3,h4,h5,h6{margin-top:1.0em;margin-bottom:.25em;color:#111;font-weight:600;{{headingBreak}}}
              h1{font-size:1.8em;border-bottom:2px solid #e0e0e0;padding-bottom:.2em}
              h2{font-size:1.4em;border-bottom:1px solid #e0e0e0;padding-bottom:.15em}
              h3{font-size:1.15em}
              h4,h5,h6{font-size:1em}
              code{background:#f0f0f0;padding:.1em .35em;border-radius:3px;font-family:Consolas,'Courier New',monospace;font-size:.88em}
              pre{background:#f5f5f5;padding:.7em 1em;border-radius:4px;overflow-x:auto;border:1px solid #e0e0e0;{{blockBreak}}}
              pre code{background:none;padding:0}
              blockquote{border-left:4px solid #ccc;margin:0 0 {{ps}}em;padding:.4em .8em;color:#555;background:#fafafa}
              table{border-collapse:collapse;width:100%;margin:{{ps}}em 0;{{blockBreak}}}
              th,td{border:1px solid #ddd;padding:.35em .7em;text-align:left}
              th{background:#f0f0f0;font-weight:600}
              tr:nth-child(even){background:#fafafa}
              hr{border:none;border-top:2px solid #e0e0e0;margin:1em 0}
              a{color:#0078d4;text-decoration:none}
              img{max-width:100%}
              ul,ol{padding-left:1.8em;margin:0 0 {{ps}}em}
              li{margin:.1em 0}
            {{pageNumCss}}
            </style>
            </head><body>
            {{body}}
            </body></html>
            """;
    }

    // $$""" lets CSS use single-brace rules naturally; {{body}} is the one interpolation.
    static string HtmlDocPreview(string body) => $$"""
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
