using PDFEditor.Core.Models;

namespace PDFEditor.Core.Services;

public sealed class PdfPageOcrService
{
    public int ApplyOcrResults(
        PageModel page,
        IReadOnlyList<OcrTextBlock> blocks,
        double imageWidth,
        double imageHeight)
    {
        if (blocks.Count == 0 || imageWidth <= 0 || imageHeight <= 0)
        {
            return 0;
        }

        var scaleX = page.Width / imageWidth;
        var scaleY = page.Height / imageHeight;
        var startIndex = page.TextElements.Count;
        var added = 0;

        for (var i = 0; i < blocks.Count; i++)
        {
            var block = blocks[i];
            var imageTop = block.ImageTop;
            var imageHeightPx = block.ImageHeight;
            var imageLeft = block.ImageLeft;
            var imageWidthPx = block.ImageWidth;

            var pdfLeft = imageLeft * scaleX;
            var pdfWidth = imageWidthPx * scaleX;
            var pdfHeight = imageHeightPx * scaleY;
            var pdfTop = page.Height - imageTop * scaleY;
            var pdfBottom = pdfTop - pdfHeight;

            page.TextElements.Add(new TextElement
            {
                Id = $"p{page.Index}-ocr{startIndex + i}",
                PageIndex = page.Index,
                Text = block.Text,
                OriginalText = block.Text,
                Bounds = new PdfBounds
                {
                    Left = pdfLeft,
                    Bottom = pdfBottom,
                    Right = pdfLeft + pdfWidth,
                    Top = pdfTop
                },
                FontName = "OCR",
                FontRefId = null,
                FontSize = Math.Max(8, pdfHeight * 0.85),
                ContentStreamIndex = 0
            });

            added++;
        }

        return added;
    }

    public static bool IsLikelyScanned(PageModel page) =>
        page.TextElements.Count == 0 && page.ImageElements.Count > 0;
}
