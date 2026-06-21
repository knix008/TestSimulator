using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using A = DocumentFormat.OpenXml.Drawing;
using DW = DocumentFormat.OpenXml.Drawing.Wordprocessing;
using PIC = DocumentFormat.OpenXml.Drawing.Pictures;

namespace MyGitWinV10.App.Services;

internal static class WordDocumentImageHelper
{
    private const int EmusPerPixel = 9525;

    public static void AddImage(
        Body body,
        MainDocumentPart mainPart,
        byte[] pngData,
        int pixelWidth,
        int pixelHeight,
        uint documentId)
    {
        var imagePart = mainPart.AddImagePart(ImagePartType.Png);
        using (var stream = new MemoryStream(pngData))
        {
            imagePart.FeedData(stream);
        }

        string relationshipId = mainPart.GetIdOfPart(imagePart);
        long width = pixelWidth * EmusPerPixel;
        long height = pixelHeight * EmusPerPixel;

        var drawing = new Drawing(
            new DW.Inline(
                new DW.Extent { Cx = width, Cy = height },
                new DW.EffectExtent
                {
                    LeftEdge = 0L,
                    TopEdge = 0L,
                    RightEdge = 0L,
                    BottomEdge = 0L
                },
                new DW.DocProperties
                {
                    Id = documentId,
                    Name = $"Chart {documentId}"
                },
                new DW.NonVisualGraphicFrameDrawingProperties(new A.GraphicFrameLocks { NoChangeAspect = true }),
                new A.Graphic(
                    new A.GraphicData(
                        new PIC.Picture(
                            new PIC.NonVisualPictureProperties(
                                new PIC.NonVisualDrawingProperties
                                {
                                    Id = documentId,
                                    Name = $"Chart{documentId}.png"
                                },
                                new PIC.NonVisualPictureDrawingProperties()),
                            new PIC.BlipFill(
                                new A.Blip { Embed = relationshipId },
                                new A.Stretch(new A.FillRectangle())),
                            new PIC.ShapeProperties(
                                new A.Transform2D(
                                    new A.Offset { X = 0L, Y = 0L },
                                    new A.Extents { Cx = width, Cy = height }),
                                new A.PresetGeometry(new A.AdjustValueList()) { Preset = A.ShapeTypeValues.Rectangle })))
                    { Uri = "http://schemas.openxmlformats.org/drawingml/2006/picture" })));

        body.AppendChild(new Paragraph(new Run(drawing)));
    }

    public static (int Width, int Height) GetPngDimensions(byte[] pngData)
    {
        using var stream = new MemoryStream(pngData);
        using var image = Image.FromStream(stream);
        return (image.Width, image.Height);
    }
}
