
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

    static string ConvertMarkdownBody(string markdown, PdfSettings settings)
    {
        string src = settings.NumberHeadings ? StripHeadingNumbers(markdown) : markdown;
        string body = Markdig.Markdown.ToHtml(src, Pipeline);
        if (settings.NumberHeadings) body = ApplyHeadingNumbering(body);
        return body;
    }

    static string AddHeadingAnchors(string body)
    {
        int i = 0;
        return Regex.Replace(body, @"<(h[1-6])([ >])",
            m => $"<{m.Groups[1].Value} id=\"h-{i++}\"{m.Groups[2].Value}");
    }

    // Preview: identical export CSS/HTML as PDF (heading anchors for outline navigation).
    public static string ToHtmlWithAnchors(string markdown, PdfSettings? settings = null) =>
        ToHtmlForPdf(markdown, settings);

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
        settings ??= PdfSettings.CreateDefault();
        return HtmlDoc(ConvertMarkdownBody(markdown, settings), settings);
    }

    public static string ToHtmlForPdf(string markdown, PdfSettings? settings = null)
    {
        settings ??= PdfSettings.CreateDefault();
        string body = AddHeadingAnchors(ConvertMarkdownBody(markdown, settings));
        return HtmlDoc(body, settings);
    }

    // Export file name: first non-empty line of the document (heading text without # / numbers).
    public static string GetDocumentExportBaseName(string markdown)
    {
        if (string.IsNullOrWhiteSpace(markdown))
            return "";

        foreach (var raw in markdown.Split('\n'))
        {
            var line = raw.TrimEnd('\r').Trim();
            if (line.Length == 0)
                continue;

            var heading = Regex.Match(line, @"^#{1,6}\s+(.*)$");
            string title = heading.Success
                ? StripLeadingNumberPrefix(heading.Groups[1].Value.Trim())
                : StripLeadingNumberPrefix(line);

            return SanitizeFileName(title);
        }
        return "";
    }

    static string SanitizeFileName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            return "";

        foreach (var c in Path.GetInvalidFileNameChars())
            name = name.Replace(c, '_');

        name = name.Trim().TrimEnd('.');
        if (name.Length > 80)
            name = name[..80].TrimEnd();
        return name;
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
        settings ??= PdfSettings.CreateDefault();
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

    static string HtmlDoc(string body, PdfSettings? settings = null)
    {
        settings ??= PdfSettings.CreateDefault();

        var ic = System.Globalization.CultureInfo.InvariantCulture;
        string ff = settings.FontFamily;
        string fs = settings.FontSizePt.ToString("0.##", ic);
        string lh = settings.LineHeight.ToString("0.##", ic);
        string ps = settings.ParagraphSpacingEm.ToString("0.##", ic);
        const double screenDpi = 96.0;
        string padTop = ((int)Math.Round(settings.MarginVerticalInch * screenDpi)).ToString(ic);
        string padBottom = padTop;
        string padLeft = ((int)Math.Round(settings.MarginHorizontalInch * screenDpi)).ToString(ic);
        string padRight = padLeft;
        const string headingBreak = "page-break-after:avoid;";
        const string blockBreak   = "page-break-inside:avoid;";
        string screenPadCss = $$"""
              @media screen{
                body{padding:{{padTop}}px {{padRight}}px {{padBottom}}px {{padLeft}}px!important}
              }
              @media print{
                body{padding:0!important}
              }
            """;

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
              body{font-family:{{ff}};font-size:{{fs}}pt;line-height:{{lh}};margin:0;padding:0;color:#1a1a1a;background:#fff}
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
            {{screenPadCss}}
            {{pageNumCss}}
            </style>
            </head><body>
            {{body}}
            </body></html>
            """;
    }
}
