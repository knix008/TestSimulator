using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using Markdig;
using Markdig.Extensions.Tables;
using Markdig.Syntax;
using Markdig.Syntax.Inlines;
using System.Drawing;
using System.Drawing.Imaging;
using A = DocumentFormat.OpenXml.Drawing;
using DW = DocumentFormat.OpenXml.Drawing.Wordprocessing;
using PIC = DocumentFormat.OpenXml.Drawing.Pictures;

namespace MyWorkspace.Win;

internal static class MarkdownDocxExporter
{
    public static void Export(string markdown, string outputPath, MarkdownPipeline pipeline)
    {
        var document = Markdown.Parse(markdown, pipeline);
        using var wordDocument = WordprocessingDocument.Create(outputPath, WordprocessingDocumentType.Document);
        var mainPart = wordDocument.AddMainDocumentPart();
        mainPart.Document = new Document(new Body());
        var body = mainPart.Document.Body!;

        foreach (var block in document)
            AppendBlock(mainPart, body, block);

        mainPart.Document.Save();
    }

    private static void AppendBlock(MainDocumentPart mainPart, Body body, Block block)
    {
        switch (block)
        {
            case HeadingBlock heading:
                AppendParagraph(mainPart, body, heading.Inline, heading.Level, bold: true);
                break;
            case ParagraphBlock paragraph:
                AppendParagraph(mainPart, body, paragraph.Inline, null);
                break;
            case ListBlock list:
                foreach (var item in list)
                {
                    if (item is not ListItemBlock listItem)
                        continue;

                    foreach (var child in listItem)
                        AppendBlock(mainPart, body, child);
                }
                break;
            case QuoteBlock quote:
                foreach (var child in quote)
                    AppendBlock(mainPart, body, child);
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
            default:
                if (block is LeafBlock leaf && leaf.Inline != null)
                    AppendParagraph(mainPart, body, leaf.Inline, null);
                break;
        }
    }

    private static void AppendParagraph(
        MainDocumentPart mainPart,
        Body body,
        ContainerInline? inline,
        int? headingLevel,
        bool bold = false,
        bool monospace = false)
    {
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
            AppendInlines(mainPart, run, inline, bold);

        paragraph.Append(run);
        body.Append(paragraph);
    }

    private static void AppendInlines(MainDocumentPart mainPart, Run run, ContainerInline inline, bool inheritedBold)
    {
        foreach (var child in inline)
            AppendInline(mainPart, run, child, inheritedBold);
    }

    private static void AppendInline(MainDocumentPart mainPart, Run run, Markdig.Syntax.Inlines.Inline inline, bool inheritedBold)
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
                    AppendInline(mainPart, childRun, child, true);
                    run.Append(childRun);
                }
                break;
            case EmphasisInline emphasis when emphasis.DelimiterChar == '~':
                foreach (var child in emphasis)
                {
                    var childRun = new Run(new RunProperties(new Strike()));
                    AppendInline(mainPart, childRun, child, inheritedBold);
                    run.Append(childRun);
                }
                break;
            case CodeInline code:
                run.Append(new Run(
                    new RunProperties(new RunFonts { Ascii = "Consolas", HighAnsi = "Consolas" }),
                    new Text(code.Content) { Space = SpaceProcessingModeValues.Preserve }));
                break;
            case LinkInline link when link.IsImage:
                AppendImage(mainPart, run, link);
                break;
            case LinkInline link:
                run.Append(new Text(link.FirstChild?.ToString() ?? link.Url ?? string.Empty)
                {
                    Space = SpaceProcessingModeValues.Preserve
                });
                break;
            case LineBreakInline:
                run.Append(new Break());
                break;
            case ContainerInline container:
                AppendInlines(mainPart, run, container, inheritedBold);
                break;
        }
    }

    private static void AppendImage(MainDocumentPart mainPart, Run run, LinkInline link)
    {
        var assetPath = PageAssetStore.TryGetAssetPathFromUri(link.Url ?? string.Empty);
        if (string.IsNullOrWhiteSpace(assetPath) && !string.IsNullOrWhiteSpace(link.Url) && File.Exists(link.Url))
            assetPath = link.Url;

        if (string.IsNullOrWhiteSpace(assetPath) || !File.Exists(assetPath))
        {
            run.Append(new Text(link.Title ?? "image") { Space = SpaceProcessingModeValues.Preserve });
            return;
        }

        if (!TryAddImagePart(mainPart, assetPath, out var relationshipId))
        {
            run.Append(new Text(link.Title ?? "image") { Space = SpaceProcessingModeValues.Preserve });
            return;
        }

        const long widthEmus = 5486400L;
        const long heightEmus = 3200400L;
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
                using var image = Image.FromFile(assetPath);
                using var pngStream = new MemoryStream();
                image.Save(pngStream, ImageFormat.Png);
                pngStream.Position = 0;

                var rasterPart = mainPart.AddImagePart(ImagePartType.Png);
                rasterPart.FeedData(pngStream);
                relationshipId = mainPart.GetIdOfPart(rasterPart);
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
            ".bmp" => ImagePartType.Bmp,
            ".webp" => ImagePartType.Png,
            ".avif" => ImagePartType.Png,
            ".tif" or ".tiff" => ImagePartType.Tiff,
            ".ico" => ImagePartType.Icon,
            _ => ImagePartType.Jpeg
        };
}
