using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using Markdig;
using Markdig.Extensions.Tables;
using Markdig.Syntax;
using Markdig.Syntax.Inlines;
using System.Drawing;
using System.Text.RegularExpressions;
using A = DocumentFormat.OpenXml.Drawing;
using DW = DocumentFormat.OpenXml.Drawing.Wordprocessing;
using PIC = DocumentFormat.OpenXml.Drawing.Pictures;

namespace MyWorkspace.Win;

internal static partial class MarkdownDocxExporter
{
    [GeneratedRegex(@"<img\b(?<attrs>[^>]*?)\/?>", RegexOptions.IgnoreCase)]
    private static partial Regex HtmlImgTagRegex();

    [GeneratedRegex(@"<a\b(?<before>[^>]*?\shref=[""'])(?<url>[^""']+)(?<after>[""'][^>]*?)>(?<text>.*?)</a>", RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex HtmlAnchorRegex();

    public static void Export(string markdown, string outputPath, MarkdownPipeline pipeline)
    {
        var document = Markdown.Parse(markdown, pipeline);
        using var wordDocument = WordprocessingDocument.Create(outputPath, WordprocessingDocumentType.Document);
        var mainPart = wordDocument.AddMainDocumentPart();
        mainPart.Document = new Document(new Body());
        var body = mainPart.Document.Body!;

        foreach (var block in document)
            AppendBlock(mainPart, body, block, outputPath);

        mainPart.Document.Save();
    }

    private static void AppendBlock(MainDocumentPart mainPart, Body body, Block block, string outputPath)
    {
        switch (block)
        {
            case HeadingBlock heading:
                AppendParagraph(mainPart, body, heading.Inline, heading.Level, outputPath, bold: true);
                break;
            case ParagraphBlock paragraph:
                AppendParagraph(mainPart, body, paragraph.Inline, null, outputPath);
                break;
            case ListBlock list:
                foreach (var item in list)
                {
                    if (item is not ListItemBlock listItem)
                        continue;

                    foreach (var child in listItem)
                        AppendBlock(mainPart, body, child, outputPath);
                }
                break;
            case QuoteBlock quote:
                foreach (var child in quote)
                    AppendBlock(mainPart, body, child, outputPath);
                break;
            case FencedCodeBlock code:
                AppendCodeBlock(body, code.Lines.ToString());
                break;
            case CodeBlock codeBlock:
                AppendCodeBlock(body, codeBlock.Lines.ToString());
                break;
            case Markdig.Extensions.Tables.Table table:
                AppendTable(body, table);
                break;
            case ThematicBreakBlock:
                body.Append(new Paragraph(new Run(new Text("────────────────────────────────"))));
                break;
            case HtmlBlock htmlBlock:
                AppendHtmlBlock(mainPart, body, htmlBlock, outputPath);
                break;
            default:
                if (block is LeafBlock leaf && leaf.Inline != null)
                    AppendParagraph(mainPart, body, leaf.Inline, null, outputPath);
                break;
        }
    }

    private static void AppendParagraph(
        MainDocumentPart mainPart,
        Body body,
        ContainerInline? inline,
        int? headingLevel,
        string outputPath,
        bool bold = false,
        bool monospace = false)
    {
        if (inline != null && TryGetStandaloneFileLink(inline, out var fileLink))
        {
            AppendFileHyperlinkParagraph(mainPart, body, fileLink, outputPath);
            return;
        }

        var paragraph = new Paragraph();
        var run = new Run();
        var props = new RunProperties();
        if (bold)
            props.Append(new Bold());
        if (monospace)
            props.Append(new RunFonts { Ascii = "Consolas", HighAnsi = "Consolas" });
        if (headingLevel is >= 1 and <= 6)
            props.Append(new FontSize { Val = ((24 - headingLevel.Value * 2) * 2).ToString() });
        if (props.HasChildren)
            run.Append(props);

        if (inline == null)
            run.Append(new Text(string.Empty));
        else
            AppendInlines(mainPart, run, inline, outputPath, bold);

        paragraph.Append(run);
        body.Append(paragraph);
    }

    private static bool TryGetStandaloneFileLink(ContainerInline inline, out LinkInline link)
    {
        link = null!;
        if (inline.FirstChild != inline.LastChild || inline.FirstChild is not LinkInline onlyLink || onlyLink.IsImage)
            return false;

        link = onlyLink;
        return true;
    }

    private static void AppendInlines(MainDocumentPart mainPart, Run run, ContainerInline inline, string outputPath, bool inheritedBold)
    {
        foreach (var child in inline)
            AppendInline(mainPart, run, child, outputPath, inheritedBold);
    }

    private static void AppendInline(MainDocumentPart mainPart, Run run, Markdig.Syntax.Inlines.Inline inline, string outputPath, bool inheritedBold)
    {
        switch (inline)
        {
            case LiteralInline literal:
                run.Append(new Text(literal.Content.ToString()) { Space = SpaceProcessingModeValues.Preserve });
                break;
            case EmphasisInline emphasis when emphasis.DelimiterChar is '*' or '_':
                foreach (var child in emphasis)
                {
                    var childRun = new Run(new RunProperties(new Bold()));
                    AppendInline(mainPart, childRun, child, outputPath, true);
                    run.Append(childRun);
                }
                break;
            case EmphasisInline emphasis when emphasis.DelimiterChar == '~':
                foreach (var child in emphasis)
                {
                    var childRun = new Run(new RunProperties(new Strike()));
                    AppendInline(mainPart, childRun, child, outputPath, inheritedBold);
                    run.Append(childRun);
                }
                break;
            case CodeInline code:
                run.Append(new Run(
                    new RunProperties(new RunFonts { Ascii = "Consolas", HighAnsi = "Consolas" }),
                    new Text(code.Content) { Space = SpaceProcessingModeValues.Preserve }));
                break;
            case LinkInline link when link.IsImage:
                AppendImage(mainPart, run, link.Url, link.Title, null, outputPath);
                break;
            case LinkInline link:
                run.Append(new Run(
                    new RunProperties(
                        new Underline { Val = UnderlineValues.Single },
                        new DocumentFormat.OpenXml.Wordprocessing.Color { Val = "0563C1" }),
                    new Text(GetLinkLabel(link)) { Space = SpaceProcessingModeValues.Preserve }));
                break;
            case LineBreakInline:
                run.Append(new Break());
                break;
            case ContainerInline container:
                AppendInlines(mainPart, run, container, outputPath, inheritedBold);
                break;
        }
    }

    private static void AppendHtmlBlock(MainDocumentPart mainPart, Body body, HtmlBlock htmlBlock, string outputPath)
    {
        var html = htmlBlock.Lines.ToString();
        if (string.IsNullOrWhiteSpace(html))
            return;

        var handled = false;
        foreach (Match match in HtmlImgTagRegex().Matches(html))
        {
            var paragraph = new Paragraph();
            var run = new Run();
            var attrs = match.Groups["attrs"].Value;
            var src = ExtractHtmlAttribute(attrs, "src");
            var alt = ExtractHtmlAttribute(attrs, "alt");
            var width = PageMarkdownNormalizer.TryGetHtmlImageWidthPx(attrs);
            AppendImage(mainPart, run, src, alt, width, outputPath);
            paragraph.Append(run);
            body.Append(paragraph);
            handled = true;
        }

        foreach (Match match in HtmlAnchorRegex().Matches(html))
        {
            var url = match.Groups["url"].Value;
            var text = StripHtml(match.Groups["text"].Value);
            if (string.IsNullOrWhiteSpace(text))
                text = Path.GetFileName(url);

            AppendFileHyperlinkParagraph(mainPart, body, text, url, outputPath);
            handled = true;
        }

        if (handled)
            return;

        var plainText = StripHtml(html).Trim();
        if (plainText.Length > 0)
            body.Append(new Paragraph(new Run(new Text(plainText) { Space = SpaceProcessingModeValues.Preserve })));
    }

    private static void AppendFileHyperlinkParagraph(MainDocumentPart mainPart, Body body, LinkInline link, string outputPath) =>
        AppendFileHyperlinkParagraph(mainPart, body, GetLinkLabel(link), link.Url ?? string.Empty, outputPath);

    private static void AppendFileHyperlinkParagraph(MainDocumentPart mainPart, Body body, string label, string url, string outputPath)
    {
        var assetPath = PageAssetStore.TryResolveExportAssetPath(url, outputPath);
        if (string.IsNullOrWhiteSpace(assetPath))
        {
            body.Append(new Paragraph(new Run(new Text(label) { Space = SpaceProcessingModeValues.Preserve })));
            return;
        }

        var relationship = mainPart.AddHyperlinkRelationship(new Uri(Path.GetFullPath(assetPath)), true);
        var paragraph = new Paragraph();
        var hyperlink = new Hyperlink(
            new Run(
                new RunProperties(
                    new Underline { Val = UnderlineValues.Single },
                    new DocumentFormat.OpenXml.Wordprocessing.Color { Val = "0563C1" }),
                new Text(label) { Space = SpaceProcessingModeValues.Preserve }))
        {
            Id = relationship.Id,
            History = OnOffValue.FromBoolean(true)
        };
        paragraph.Append(hyperlink);
        body.Append(paragraph);
    }

    private static void AppendImage(
        MainDocumentPart mainPart,
        Run run,
        string? url,
        string? alt,
        int? widthPx,
        string outputPath)
    {
        var assetPath = PageAssetStore.TryResolveExportAssetPath(url ?? string.Empty, outputPath);
        if (string.IsNullOrWhiteSpace(assetPath))
        {
            run.Append(new Text(alt ?? "image") { Space = SpaceProcessingModeValues.Preserve });
            return;
        }

        if (!TryAddImagePart(mainPart, assetPath, out var relationshipId))
        {
            run.Append(new Text(alt ?? "image") { Space = SpaceProcessingModeValues.Preserve });
            return;
        }

        var (widthEmus, heightEmus) = GetImageExtents(assetPath, widthPx);
        var drawing = new Drawing(
            new DW.Inline(
                new DW.Extent { Cx = widthEmus, Cy = heightEmus },
                new DW.EffectExtent(),
                new DW.DocProperties { Id = 1U, Name = Path.GetFileName(assetPath) },
                new DW.NonVisualGraphicFrameDrawingProperties(new A.GraphicFrameLocks { NoChangeAspect = true }),
                new A.Graphic(
                    new A.GraphicData(
                        new PIC.Picture(
                            new PIC.NonVisualPictureProperties(
                                new PIC.NonVisualDrawingProperties { Id = 0U, Name = Path.GetFileName(assetPath) },
                                new PIC.NonVisualPictureDrawingProperties()),
                            new PIC.BlipFill(
                                new A.Blip { Embed = relationshipId },
                                new A.Stretch(new A.FillRectangle())),
                            new PIC.ShapeProperties(
                                new A.Transform2D(
                                    new A.Offset { X = 0L, Y = 0L },
                                    new A.Extents { Cx = widthEmus, Cy = heightEmus }),
                                new A.PresetGeometry(new A.AdjustValueList()) { Preset = A.ShapeTypeValues.Rectangle })))
                    { Uri = "http://schemas.openxmlformats.org/drawingml/2006/picture" })));

        run.Append(drawing);
    }

    private static (long WidthEmus, long HeightEmus) GetImageExtents(string assetPath, int? widthPx)
    {
        const long emuPerPixel = 9525L;

        try
        {
            using var image = Image.FromFile(assetPath);
            var targetWidth = widthPx is > 0 ? widthPx.Value : image.Width;
            var targetHeight = Math.Max(1, (int)Math.Round(image.Height * (targetWidth / (double)Math.Max(1, image.Width))));
            return (targetWidth * emuPerPixel, targetHeight * emuPerPixel);
        }
        catch
        {
            const long fallbackWidth = 5486400L;
            const long fallbackHeight = 3200400L;
            if (widthPx is > 0)
                return (widthPx.Value * emuPerPixel, (long)(widthPx.Value * 0.75 * emuPerPixel));

            return (fallbackWidth, fallbackHeight);
        }
    }

    private static void AppendCodeBlock(Body body, string text)
    {
        body.Append(new Paragraph(new Run(
            new RunProperties(new RunFonts { Ascii = "Consolas", HighAnsi = "Consolas" }),
            new Text(text) { Space = SpaceProcessingModeValues.Preserve })));
    }

    private static void AppendTable(Body body, Markdig.Extensions.Tables.Table tableBlock)
    {
        var table = new DocumentFormat.OpenXml.Wordprocessing.Table();
        foreach (var rowBlock in tableBlock.OfType<Markdig.Extensions.Tables.TableRow>())
        {
            var row = new DocumentFormat.OpenXml.Wordprocessing.TableRow();
            foreach (var cellBlock in rowBlock.OfType<Markdig.Extensions.Tables.TableCell>())
            {
                var text = cellBlock.FirstOrDefault() is ParagraphBlock paragraph
                    ? paragraph.Inline?.FirstChild?.ToString() ?? string.Empty
                    : string.Empty;
                row.Append(new DocumentFormat.OpenXml.Wordprocessing.TableCell(new Paragraph(new Run(new Text(text)))));
            }

            table.Append(row);
        }

        body.Append(table);
    }

    private static bool TryAddImagePart(MainDocumentPart mainPart, string assetPath, out string relationshipId)
    {
        relationshipId = string.Empty;

        try
        {
            var extension = Path.GetExtension(assetPath);
            if (PageAssetStore.RequiresWordRasterization(extension))
            {
                if (!ImageRasterizer.TryRasterizeToPng(assetPath, out var pngStream))
                    return false;

                using (pngStream)
                {
                    var rasterPart = mainPart.AddImagePart(ImagePartType.Png);
                    rasterPart.FeedData(pngStream);
                    relationshipId = mainPart.GetIdOfPart(rasterPart);
                }

                return true;
            }

            var imagePart = mainPart.AddImagePart(GetImagePartType(assetPath));
            using (var stream = File.OpenRead(assetPath))
                imagePart.FeedData(stream);

            relationshipId = mainPart.GetIdOfPart(imagePart);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static PartTypeInfo GetImagePartType(string path) =>
        Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".png" => ImagePartType.Png,
            ".gif" => ImagePartType.Gif,
            ".webp" => ImagePartType.Png,
            ".avif" => ImagePartType.Png,
            _ => ImagePartType.Jpeg
        };

    private static string GetLinkLabel(LinkInline link) =>
        link.FirstChild?.ToString() ?? link.Title ?? Path.GetFileName(link.Url ?? "file");

    private static string? ExtractHtmlAttribute(string attrs, string name)
    {
        var pattern = $"""{Regex.Escape(name)}\s*=\s*("([^"]*)"|'([^']*)')""";
        var match = Regex.Match(attrs, pattern, RegexOptions.IgnoreCase);
        if (!match.Success)
            return null;

        return match.Groups[2].Success ? match.Groups[2].Value : match.Groups[3].Value;
    }

    private static string StripHtml(string value) =>
        Regex.Replace(value, "<[^>]+>", string.Empty).Trim();
}
