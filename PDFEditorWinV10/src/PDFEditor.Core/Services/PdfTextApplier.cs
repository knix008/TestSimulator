using iText.Kernel.Colors;
using iText.Kernel.Font;
using iText.Kernel.Pdf;
using iText.Kernel.Pdf.Canvas;
using PDFEditor.Core.Models;

namespace PDFEditor.Core.Services;

/// <summary>
/// Applies text edits by overlaying changed regions while preserving original content streams.
/// </summary>
public sealed class PdfTextApplier
{
    public int ApplyFromDocument(PdfDocument pdfDoc, EditorDocument document)
    {
        var changedElements = document.Pages
            .SelectMany(p => p.TextElements)
            .Where(e => !string.Equals(e.Text, e.OriginalText, StringComparison.Ordinal))
            .ToList();

        if (changedElements.Count == 0)
        {
            return 0;
        }

        var applied = 0;
        var byPage = changedElements.GroupBy(e => e.PageIndex);

        foreach (var group in byPage)
        {
            var pageNumber = group.Key + 1;
            if (pageNumber < 1 || pageNumber > pdfDoc.GetNumberOfPages())
            {
                continue;
            }

            var page = pdfDoc.GetPage(pageNumber);
            var canvas = new PdfCanvas(page, true);

            foreach (var element in group)
            {
                WhiteOutRegion(canvas, element.Bounds);
                DrawText(canvas, page, pdfDoc, element, element.Text);
                applied++;
            }

            canvas.Release();
        }

        return applied;
    }

    private static void WhiteOutRegion(PdfCanvas canvas, PdfBounds bounds)
    {
        canvas.SaveState();
        canvas.SetFillColor(ColorConstants.WHITE);
        canvas.Rectangle(bounds.Left, bounds.Bottom, bounds.Width, bounds.Height);
        canvas.Fill();
        canvas.RestoreState();
    }

    private static void DrawText(PdfCanvas canvas, PdfPage page, PdfDocument pdfDoc, TextElement element, string newText)
    {
        var font = PdfCjkFontResolver.Resolve(page, element, pdfDoc);
        var fontSize = element.FontSize > 0 ? (float)element.FontSize : 12f;

        canvas.SaveState();
        canvas.BeginText();
        canvas.SetFontAndSize(font, fontSize);
        canvas.SetTextMatrix(1, 0, 0, 1, (float)element.Bounds.Left, (float)element.Bounds.Bottom);
        canvas.ShowText(newText);
        canvas.EndText();
        canvas.RestoreState();
    }

    internal static PdfFont? ResolveFontFromPage(PdfPage page, TextElement element)
    {
        var byRef = PdfFontExtractor.ResolveFont(page, element.FontRefId);
        if (byRef is not null)
        {
            return byRef;
        }

        var resources = page.GetResources();
        var fontDict = resources?.GetResource(PdfName.Font) as PdfDictionary;
        if (fontDict is null)
        {
            return null;
        }

        foreach (var key in fontDict.KeySet())
        {
            if (fontDict.Get(key) is not PdfDictionary fontObject)
            {
                continue;
            }

            var baseFont = fontObject.GetAsName(PdfName.BaseFont)?.GetValue()?.TrimStart('/');
            if (string.Equals(baseFont, element.FontName, StringComparison.OrdinalIgnoreCase))
            {
                return PdfFontFactory.CreateFont(fontObject);
            }
        }

        return null;
    }

    public static void ResetOriginalText(EditorDocument document)
    {
        foreach (var page in document.Pages)
        {
            foreach (var element in page.TextElements)
            {
                element.OriginalText = element.Text;
            }
        }
    }
}
