using iText.IO.Image;
using iText.Kernel.Colors;
using iText.Kernel.Geom;
using iText.Kernel.Pdf;
using iText.Kernel.Pdf.Canvas;
using iText.Kernel.Pdf.Xobject;
using PDFEditor.Core.Models;

namespace PDFEditor.Core.Services;

/// <summary>
/// Applies image resize and replacement by covering the original region and redrawing.
/// </summary>
public sealed class PdfImageApplier
{
    public int ApplyFromDocument(PdfDocument pdfDoc, EditorDocument document)
    {
        var modifiedImages = document.Pages
            .SelectMany(page => page.ImageElements)
            .Where(image => image.IsModified)
            .ToList();

        if (modifiedImages.Count == 0)
        {
            return 0;
        }

        var applied = 0;
        foreach (var group in modifiedImages.GroupBy(image => image.PageIndex))
        {
            var pageNumber = group.Key + 1;
            if (pageNumber < 1 || pageNumber > pdfDoc.GetNumberOfPages())
            {
                continue;
            }

            var page = pdfDoc.GetPage(pageNumber);
            var canvas = new PdfCanvas(page, true);

            foreach (var imageElement in group)
            {
                if (TryApplyImageChange(page, canvas, imageElement))
                {
                    applied++;
                }
            }

            canvas.Release();
        }

        return applied;
    }

    private static bool TryApplyImageChange(PdfPage page, PdfCanvas canvas, ImageElementModel element)
    {
        var imageXObject = LoadImageXObject(page, element);
        if (imageXObject is null)
        {
            return false;
        }

        if (!string.IsNullOrWhiteSpace(element.ReplacementImagePath))
        {
            TryReplaceXObjectStream(page, element, imageXObject);
        }

        WhiteOutRegion(canvas, element.OriginalBounds);

        var rect = new Rectangle(
            (float)element.Bounds.Left,
            (float)element.Bounds.Bottom,
            (float)element.Bounds.Width,
            (float)element.Bounds.Height);

        canvas.AddXObjectFittedIntoRectangle(imageXObject, rect);
        return true;
    }

    private static PdfImageXObject? LoadImageXObject(PdfPage page, ImageElementModel element)
    {
        if (!string.IsNullOrWhiteSpace(element.ReplacementImagePath) && File.Exists(element.ReplacementImagePath))
        {
            var imageData = ImageDataFactory.Create(element.ReplacementImagePath);
            return new PdfImageXObject(imageData);
        }

        return TryGetExistingXObject(page, element.XObjectName);
    }

    private static PdfImageXObject? TryGetExistingXObject(PdfPage page, string xObjectName)
    {
        if (string.IsNullOrWhiteSpace(xObjectName))
        {
            return null;
        }

        var resources = page.GetResources();
        var xObjects = resources?.GetResource(PdfName.XObject) as PdfDictionary;
        if (xObjects is null)
        {
            return null;
        }

        var key = new PdfName(xObjectName.TrimStart('/'));
        if (xObjects.Get(key) is not PdfStream stream)
        {
            return null;
        }

        if (!PdfName.Image.Equals(stream.GetAsName(PdfName.Subtype)))
        {
            return null;
        }

        return new PdfImageXObject(stream);
    }

    private static void TryReplaceXObjectStream(PdfPage page, ImageElementModel element, PdfImageXObject newImage)
    {
        var resources = page.GetResources();
        var xObjects = resources?.GetResource(PdfName.XObject) as PdfDictionary;
        if (xObjects is null || string.IsNullOrWhiteSpace(element.XObjectName))
        {
            return;
        }

        var key = new PdfName(element.XObjectName.TrimStart('/'));
        if (xObjects.Get(key) is not PdfStream targetStream)
        {
            return;
        }

        var replacementBytes = newImage.GetPdfObject().GetBytes();
        targetStream.Remove(PdfName.Filter);
        targetStream.SetData(replacementBytes);
    }

    private static void WhiteOutRegion(PdfCanvas canvas, PdfBounds bounds)
    {
        const float padding = 2f;
        canvas.SaveState();
        canvas.SetFillColor(ColorConstants.WHITE);
        canvas.Rectangle(
            bounds.Left - padding,
            bounds.Bottom - padding,
            bounds.Width + padding * 2,
            bounds.Height + padding * 2);
        canvas.Fill();
        canvas.RestoreState();
    }

    public static void ResetOriginalState(EditorDocument document)
    {
        foreach (var image in document.Pages.SelectMany(p => p.ImageElements))
        {
            image.OriginalBounds = PdfBounds.Clone(image.Bounds);
            image.OriginalTransform = (double[])image.Transform.Clone();
            image.ReplacementImagePath = null;
        }
    }
}
