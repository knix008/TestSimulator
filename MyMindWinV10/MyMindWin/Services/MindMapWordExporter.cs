using System;
using System.IO;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using A = DocumentFormat.OpenXml.Drawing;
using DW = DocumentFormat.OpenXml.Drawing.Wordprocessing;
using PIC = DocumentFormat.OpenXml.Drawing.Pictures;
using MyMindWin.Models;

namespace MyMindWin.Services
{
    public static class MindMapWordExporter
    {
        private const int TwipsPerLevel = 360;
        private const long MaxImageWidthEmu = 2_286_000; // ~2.5 inch

        public static void Export(MindMapNode root, string title, string filePath, MindMapExportOptions options)
        {
            using var document = WordprocessingDocument.Create(filePath, WordprocessingDocumentType.Document);
            var mainPart = document.AddMainDocumentPart();
            mainPart.Document = new Document(new Body());
            var body = mainPart.Document.Body!;

            body.Append(CreateParagraph(title, level: -1, bold: true, fontSizeHalfPoints: 32));
            body.Append(CreateParagraph(string.Empty, level: 0));

            AppendNode(body, mainPart, root, level: 0, options);

            mainPart.Document.Save();
        }

        private static void AppendNode(Body body, MainDocumentPart mainPart, MindMapNode node, int level, MindMapExportOptions options)
        {
            body.Append(CreateParagraph(node.Text, level, bold: level == 0, fontSizeHalfPoints: level == 0 ? 28 : 22));

            if (options.IncludeNotes && !string.IsNullOrWhiteSpace(node.Note))
            {
                foreach (var line in node.Note.Replace("\r\n", "\n").Split('\n'))
                    body.Append(CreateParagraph(line, level + 1, italic: true, fontSizeHalfPoints: 20));
            }

            if (options.IncludeImages)
            {
                var bytes = MindMapExportImageHelper.TryDecode(node.Image);
                if (bytes != null)
                    body.Append(CreateImageParagraph(mainPart, bytes, MindMapExportImageHelper.NormalizeMime(node.ImageMime), level + 1));
            }

            foreach (var child in node.Children)
                AppendNode(body, mainPart, child, level + 1, options);
        }

        private static Paragraph CreateParagraph(
            string text,
            int level,
            bool bold = false,
            bool italic = false,
            int fontSizeHalfPoints = 22)
        {
            var paragraph = new Paragraph();
            var props = new ParagraphProperties();

            if (level >= 0)
            {
                props.Append(new Indentation
                {
                    Left = (Math.Max(0, level) * TwipsPerLevel).ToString()
                });
            }

            paragraph.Append(props);

            var run = new Run();
            var runProps = new RunProperties();
            if (bold) runProps.Append(new Bold());
            if (italic) runProps.Append(new Italic());
            runProps.Append(new FontSize { Val = fontSizeHalfPoints.ToString() });
            run.Append(runProps);
            run.Append(new Text(text) { Space = SpaceProcessingModeValues.Preserve });
            paragraph.Append(run);
            return paragraph;
        }

        private static Paragraph CreateImageParagraph(MainDocumentPart mainPart, byte[] imageBytes, string mime, int level)
        {
            var paragraph = new Paragraph();
            var props = new ParagraphProperties();
            props.Append(new Indentation { Left = (Math.Max(0, level) * TwipsPerLevel).ToString() });
            paragraph.Append(props);

            var relationshipId = AddImagePart(mainPart, imageBytes, mime, out var widthEmu, out var heightEmu);
            var drawing = CreateDrawing(relationshipId, widthEmu, heightEmu);
            var run = new Run(drawing);
            paragraph.Append(run);
            return paragraph;
        }

        private static string AddImagePart(MainDocumentPart mainPart, byte[] imageBytes, string mime, out long widthEmu, out long heightEmu)
        {
            var partType = mime switch
            {
                "image/jpeg" => ImagePartType.Jpeg,
                "image/gif" => ImagePartType.Gif,
                "image/bmp" => ImagePartType.Bmp,
                _ => ImagePartType.Png
            };

            var imagePart = mainPart.AddImagePart(partType);
            using (var stream = new MemoryStream(imageBytes))
                imagePart.FeedData(stream);

            (widthEmu, heightEmu) = EstimateImageSizeEmu(imageBytes, MaxImageWidthEmu);
            return mainPart.GetIdOfPart(imagePart);
        }

        private static (long Width, long Height) EstimateImageSizeEmu(byte[] imageBytes, long maxWidthEmu)
        {
            try
            {
                using var stream = new MemoryStream(imageBytes);
                var decoder = System.Windows.Media.Imaging.BitmapDecoder.Create(
                    stream,
                    System.Windows.Media.Imaging.BitmapCreateOptions.None,
                    System.Windows.Media.Imaging.BitmapCacheOption.OnLoad);

                var frame = decoder.Frames[0];
                double pxW = frame.PixelWidth;
                double pxH = frame.PixelHeight;
                if (pxW <= 0 || pxH <= 0)
                    return (maxWidthEmu, maxWidthEmu * 3 / 4);

                const long emuPerPixel = 9525;
                long widthEmu = (long)(pxW * emuPerPixel);
                long heightEmu = (long)(pxH * emuPerPixel);

                if (widthEmu > maxWidthEmu)
                {
                    double scale = maxWidthEmu / (double)widthEmu;
                    widthEmu = maxWidthEmu;
                    heightEmu = (long)(heightEmu * scale);
                }

                return (widthEmu, heightEmu);
            }
            catch
            {
                return (maxWidthEmu, maxWidthEmu * 3 / 4);
            }
        }

        private static Drawing CreateDrawing(string relationshipId, long widthEmu, long heightEmu)
        {
            var element = new Drawing(
                new DW.Inline(
                    new DW.Extent { Cx = widthEmu, Cy = heightEmu },
                    new DW.EffectExtent
                    {
                        LeftEdge = 0L,
                        TopEdge = 0L,
                        RightEdge = 0L,
                        BottomEdge = 0L
                    },
                    new DW.DocProperties { Id = 1U, Name = "MindMapImage" },
                    new DW.NonVisualGraphicFrameDrawingProperties(new A.GraphicFrameLocks { NoChangeAspect = true }),
                    new A.Graphic(
                        new A.GraphicData(
                            new PIC.Picture(
                                new PIC.NonVisualPictureProperties(
                                    new PIC.NonVisualDrawingProperties { Id = 0U, Name = "Image.png" },
                                    new PIC.NonVisualPictureDrawingProperties()),
                                new PIC.BlipFill(
                                    new A.Blip { Embed = relationshipId },
                                    new A.Stretch(new A.FillRectangle())),
                                new PIC.ShapeProperties(
                                    new A.Transform2D(
                                        new A.Offset { X = 0L, Y = 0L },
                                        new A.Extents { Cx = widthEmu, Cy = heightEmu }),
                                    new A.PresetGeometry(new A.AdjustValueList()) { Preset = A.ShapeTypeValues.Rectangle })))
                        { Uri = "http://schemas.openxmlformats.org/drawingml/2006/picture" }))
                {
                    DistanceFromTop = 0U,
                    DistanceFromBottom = 0U,
                    DistanceFromLeft = 0U,
                    DistanceFromRight = 0U
                });

            return element;
        }
    }
}
