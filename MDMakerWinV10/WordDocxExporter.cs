using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using Markdig;
using Markdig.Syntax;
using Markdig.Syntax.Inlines;
using System.Text;
using MdTable = Markdig.Extensions.Tables.Table;
using MdTableRow = Markdig.Extensions.Tables.TableRow;
using MdTableCell = Markdig.Extensions.Tables.TableCell;

namespace MDMakerWinV10;

/// <summary>Word(.docx) 보내기 — DOTX/DOTM 템플릿 양식 또는 HTML AltChunk.</summary>
static class WordDocxExporter
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

    public static void Export(string markdown, string outputPath, PdfSettings? settings = null)
    {
        settings ??= PdfSettings.CreateDefault();
        var template = settings.WordTemplatePath?.Trim() ?? "";
        if (!string.IsNullOrEmpty(template) && File.Exists(template))
            ExportFromTemplate(markdown, outputPath, template, settings);
        else
            ExportViaHtml(markdown, outputPath, settings);
    }

    static void ExportFromTemplate(string markdown, string outputPath, string templatePath, PdfSettings settings)
    {
        File.Copy(templatePath, outputPath, true);

        using var doc = WordprocessingDocument.Open(outputPath, true);
        doc.ChangeDocumentType(WordprocessingDocumentType.Document);

        var main = doc.MainDocumentPart ?? throw new InvalidOperationException("템플릿에 본문 파트가 없습니다.");
        main.Document ??= new Document(new Body());
        var body = main.Document.Body ?? throw new InvalidOperationException("템플릿에 본문이 없습니다.");

        var sectPr = body.Elements<SectionProperties>().LastOrDefault()?.CloneNode(true) as SectionProperties;
        body.RemoveAllChildren();

        var styles = TemplateStyles.Load(main);
        var prepared = PrepareMarkdown(markdown, settings);
        var ast = Markdown.Parse(prepared, Pipeline);
        AppendBlocks(body, ast, styles);

        if (sectPr != null)
            body.AppendChild(sectPr);

        main.Document.Save();
        ApplyDocxHeaderFooter(doc, settings);
    }

    static void ExportViaHtml(string markdown, string outputPath, PdfSettings settings)
    {
        const string chunkId = "chunk1";
        byte[] htmlBytes = Encoding.UTF8.GetPreamble()
            .Concat(Encoding.UTF8.GetBytes(MarkdownConverter.ToHtml(markdown, settings))).ToArray();

        using var doc = WordprocessingDocument.Create(outputPath, WordprocessingDocumentType.Document);
        var main = doc.AddMainDocumentPart();
        main.Document = new Document(new Body());

        var chunk = main.AddAlternativeFormatImportPart(AlternativeFormatImportPartType.Html, chunkId);
        using var ms = new MemoryStream(htmlBytes);
        chunk.FeedData(ms);

        main.Document.Body!.AppendChild(new AltChunk { Id = chunkId });
        ApplyDocxHeaderFooter(doc, settings);
        main.Document.Save();
    }

    static string PrepareMarkdown(string markdown, PdfSettings settings)
    {
        if (!settings.NumberHeadings)
            return markdown;
        return MarkdownConverter.ApplyHeadingNumberingToMarkdown(MarkdownConverter.StripHeadingNumbers(markdown));
    }

    static void AppendBlocks(OpenXmlElement container, MarkdownDocument doc, TemplateStyles styles)
    {
        foreach (var block in doc)
            AppendBlock(container, block, styles, listDepth: 0);
    }

    static void AppendBlock(OpenXmlElement container, Block block, TemplateStyles styles, int listDepth)
    {
        switch (block)
        {
            case HeadingBlock h:
                container.AppendChild(MakeParagraph(GetHeadingText(h), styles.Heading(h.Level)));
                break;
            case ParagraphBlock p:
                container.AppendChild(MakeParagraph(GetInlineText(p.Inline), styles.Normal));
                break;
            case ListBlock list:
                int index = 1;
                foreach (var item in list)
                {
                    if (item is ListItemBlock li)
                        AppendListItem(container, li, styles, list.IsOrdered, list.BulletType, listDepth, ref index);
                }
                break;
            case QuoteBlock quote:
                foreach (var child in quote)
                    AppendBlock(container, child, styles, listDepth);
                break;
            case CodeBlock code:
                foreach (var line in code.Lines.Lines)
                    container.AppendChild(MakeParagraph(line.ToString(), styles.Normal, monospace: true));
                break;
            case ThematicBreakBlock:
                container.AppendChild(MakeParagraph("—", styles.Normal));
                break;
            case MdTable table:
                AppendTable(container, table, styles);
                break;
            default:
                if (block is ContainerBlock cb)
                {
                    foreach (var child in cb)
                        AppendBlock(container, child, styles, listDepth);
                }
                break;
        }
    }

    static void AppendListItem(
        OpenXmlElement container,
        ListItemBlock item,
        TemplateStyles styles,
        bool ordered,
        char bulletType,
        int depth,
        ref int index)
    {
        string prefix = ordered ? $"{index++}. " : $"{BulletChar(bulletType, depth)} ";
        var styleId = styles.ListParagraph ?? styles.Normal;

        foreach (var child in item)
        {
            if (child is ParagraphBlock para)
            {
                var text = prefix + GetInlineText(para.Inline);
                prefix = "";
                container.AppendChild(MakeParagraph(text, styleId));
            }
            else if (child is ListBlock nested)
            {
                if (!string.IsNullOrEmpty(prefix))
                {
                    container.AppendChild(MakeParagraph(prefix.TrimEnd(), styleId));
                    prefix = "";
                }
                int nestedIndex = 1;
                foreach (var nestedItem in nested)
                {
                    if (nestedItem is ListItemBlock li)
                        AppendListItem(container, li, styles, nested.IsOrdered, nested.BulletType, depth + 1, ref nestedIndex);
                }
            }
            else
            {
                AppendBlock(container, child, styles, depth + 1);
            }
        }
    }

    static char BulletChar(char bulletType, int depth) =>
        bulletType switch
        {
            '-' or '_' => depth == 0 ? '-' : '•',
            '1' or ')' => '•',
            _ => '•',
        };

    static void AppendTable(OpenXmlElement container, MdTable table, TemplateStyles styles)
    {
        var wordTable = new DocumentFormat.OpenXml.Wordprocessing.Table();
        foreach (var row in table.OfType<MdTableRow>())
        {
            var tr = new TableRow();
            foreach (var cell in row.OfType<MdTableCell>())
            {
                var tc = new TableCell();
                var text = new StringBuilder();
                foreach (var block in cell)
                {
                    if (block is ParagraphBlock para)
                        text.Append(GetInlineText(para.Inline));
                }
                tc.AppendChild(MakeParagraph(text.ToString(), styles.Normal));
                tr.AppendChild(tc);
            }
            wordTable.AppendChild(tr);
        }
        container.AppendChild(wordTable);
    }

    static Paragraph MakeParagraph(string text, string styleId, bool monospace = false)
    {
        var para = new Paragraph();
        para.AppendChild(new ParagraphProperties(new ParagraphStyleId { Val = styleId }));
        if (string.IsNullOrEmpty(text))
            text = "";
        var run = new Run();
        if (monospace)
        {
            run.AppendChild(new RunProperties(
                new RunFonts { Ascii = "Consolas", HighAnsi = "Consolas", EastAsia = "맑은 고딕" }));
        }
        run.AppendChild(new Text(text) { Space = SpaceProcessingModeValues.Preserve });
        para.AppendChild(run);
        return para;
    }

    static string GetHeadingText(HeadingBlock h)
    {
        var sb = new StringBuilder();
        CollectText(h.Inline, sb);
        return sb.ToString().Trim();
    }

    static string GetInlineText(ContainerInline? container)
    {
        if (container == null) return "";
        var sb = new StringBuilder();
        CollectText(container, sb);
        return sb.ToString();
    }

    static void CollectText(ContainerInline? container, StringBuilder sb)
    {
        if (container == null) return;
        foreach (var inline in container)
        {
            switch (inline)
            {
                case LiteralInline lit:
                    sb.Append(lit.Content.ToString());
                    break;
                case LineBreakInline:
                    sb.AppendLine();
                    break;
                case CodeInline code:
                    sb.Append(code.Content);
                    break;
                case LinkInline link:
                    CollectText(link, sb);
                    break;
                case ContainerInline sub:
                    CollectText(sub, sb);
                    break;
            }
        }
    }

    static void ApplyDocxHeaderFooter(WordprocessingDocument doc, PdfSettings settings)
    {
        var main = doc.MainDocumentPart;
        if (main?.Document?.Body == null)
            return;

        var layout = ExportMarginLayout.Resolve(settings);
        if (layout.ConfidentialText == null && layout.CopyrightText == null && layout.PageNumberSlot == null)
            return;

        var sectPr = main.Document.Body.Elements<SectionProperties>().LastOrDefault();
        if (sectPr == null)
        {
            sectPr = new SectionProperties();
            main.Document.Body.AppendChild(sectPr);
        }

        var topSlots = new[]
        {
            PageNumberPosition.TopLeft,
            PageNumberPosition.TopCenter,
            PageNumberPosition.TopRight,
        };
        var bottomSlots = new[]
        {
            PageNumberPosition.BottomLeft,
            PageNumberPosition.BottomCenter,
            PageNumberPosition.BottomRight,
        };

        if (topSlots.Any(s => SlotHasContent(layout, s)))
        {
            var headerPart = GetOrCreateHeaderPart(main, sectPr);
            foreach (var slot in topSlots)
                AppendSlotContent(headerPart.Header!, layout, slot);
            headerPart.Header!.Save();
        }

        if (bottomSlots.Any(s => SlotHasContent(layout, s)))
        {
            var footerPart = GetOrCreateFooterPart(main, sectPr);
            foreach (var slot in bottomSlots)
                AppendSlotContent(footerPart.Footer!, layout, slot);
            footerPart.Footer!.Save();
        }
    }

    static bool SlotHasContent(ExportMarginLayout.Result layout, PageNumberPosition slot) =>
        layout.ConfidentialSlot == slot
        || layout.CopyrightSlot == slot
        || layout.PageNumberSlot == slot;

    static void AppendSlotContent(OpenXmlElement container, ExportMarginLayout.Result layout, PageNumberPosition slot)
    {
        if (layout.ConfidentialSlot == slot && layout.ConfidentialText != null)
            container.AppendChild(MakeTextParagraph(layout.ConfidentialText, JustificationForSlot(slot)));
        if (layout.CopyrightSlot == slot && layout.CopyrightText != null)
            container.AppendChild(MakeTextParagraph(layout.CopyrightText, JustificationForSlot(slot)));
        if (layout.PageNumberSlot == slot)
            container.AppendChild(MakePageNumberParagraph(slot));
    }

    static JustificationValues JustificationForSlot(PageNumberPosition slot) => slot switch
    {
        PageNumberPosition.BottomCenter or PageNumberPosition.TopCenter => JustificationValues.Center,
        PageNumberPosition.BottomRight or PageNumberPosition.TopRight => JustificationValues.Right,
        _ => JustificationValues.Left,
    };

    static Paragraph MakePageNumberParagraph(PageNumberPosition slot)
    {
        var para = new Paragraph();
        para.Append(new ParagraphProperties(new Justification { Val = JustificationForSlot(slot) }));
        para.Append(new Run(new FieldChar { FieldCharType = FieldCharValues.Begin }));
        para.Append(new Run(new FieldCode(" PAGE ")));
        para.Append(new Run(new FieldChar { FieldCharType = FieldCharValues.Separate }));
        para.Append(new Run(new Text("1")));
        para.Append(new Run(new FieldChar { FieldCharType = FieldCharValues.End }));
        return para;
    }

    static HeaderPart GetOrCreateHeaderPart(MainDocumentPart main, SectionProperties sectPr)
    {
        var existing = sectPr.Elements<HeaderReference>()
            .FirstOrDefault(r => r.Type?.Value == HeaderFooterValues.Default);
        if (existing?.Id?.Value != null)
        {
            var part = (HeaderPart)main.GetPartById(existing.Id.Value);
            part.Header ??= new Header();
            return part;
        }

        var headerPart = main.AddNewPart<HeaderPart>();
        headerPart.Header = new Header();
        sectPr.Append(new HeaderReference { Type = HeaderFooterValues.Default, Id = main.GetIdOfPart(headerPart) });
        return headerPart;
    }

    static FooterPart GetOrCreateFooterPart(MainDocumentPart main, SectionProperties sectPr)
    {
        var existing = sectPr.Elements<FooterReference>()
            .FirstOrDefault(r => r.Type?.Value == HeaderFooterValues.Default);
        if (existing?.Id?.Value != null)
        {
            var part = (FooterPart)main.GetPartById(existing.Id.Value);
            part.Footer ??= new Footer();
            return part;
        }

        var footerPart = main.AddNewPart<FooterPart>();
        footerPart.Footer = new Footer();
        sectPr.Append(new FooterReference { Type = HeaderFooterValues.Default, Id = main.GetIdOfPart(footerPart) });
        return footerPart;
    }

    static Paragraph MakeTextParagraph(string text, JustificationValues align)
    {
        var para = new Paragraph();
        para.Append(new ParagraphProperties(new Justification { Val = align }));
        para.Append(new Run(new Text(text) { Space = SpaceProcessingModeValues.Preserve }));
        return para;
    }

    sealed class TemplateStyles
    {
        public string Normal { get; private set; } = "Normal";
        public string? ListParagraph { get; private set; }
        readonly string[] _headings = ["Heading1", "Heading2", "Heading3", "Heading4", "Heading5", "Heading6"];

        public string Heading(int level)
        {
            int idx = Math.Clamp(level - 1, 0, 5);
            return _headings[idx];
        }

        public static TemplateStyles Load(MainDocumentPart main)
        {
            var result = new TemplateStyles();
            var stylesPart = main.StyleDefinitionsPart;
            if (stylesPart?.Styles == null)
                return result;

            foreach (var style in stylesPart.Styles.Elements<Style>())
            {
                var id = style.StyleId?.Value;
                if (string.IsNullOrEmpty(id)) continue;

                var name = style.StyleName?.Val?.Value ?? "";
                var lower = name.ToLowerInvariant();

                if (lower == "normal" || lower == "본문" || lower == "body text")
                    result.Normal = id;

                if (lower.Contains("list paragraph") || lower.Contains("목록"))
                    result.ListParagraph = id;

                for (int level = 1; level <= 6; level++)
                {
                    if (lower == $"heading {level}" || lower == $"제목 {level}" ||
                        name == $"Heading {level}" || name == $"제목 {level}")
                        result._headings[level - 1] = id;
                }

                var outlineVal = style.StyleParagraphProperties?.OutlineLevel?.Val;
                if (outlineVal != null)
                {
                    int idx = outlineVal.Value;
                    if (idx >= 0 && idx < 6)
                        result._headings[idx] = id;
                }
            }

            return result;
        }
    }
}
