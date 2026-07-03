using System.IO;
using System.Windows.Media.Imaging;

namespace PDFEditor.App.Services;

public interface IPageImageExporter
{
    PageImageExportResult? ExportPage(string pdfPath, int pageIndex, double scale = 2.0);
}

public sealed class PageImageExportResult
{
    public required string ImagePath { get; init; }
    public required double Width { get; init; }
    public required double Height { get; init; }
}

public sealed class PageImageExporter : IPageImageExporter
{
    public PageImageExportResult? ExportPage(string pdfPath, int pageIndex, double scale = 2.0)
    {
        using var renderService = new PdfRenderService();
        var bitmap = renderService.RenderPage(pdfPath, pageIndex, scale);
        if (bitmap is null)
        {
            return null;
        }

        var tempDir = Path.Combine(Path.GetTempPath(), "PDFEditorWinV10", "ocr");
        Directory.CreateDirectory(tempDir);

        var imagePath = Path.Combine(tempDir, $"page_{pageIndex}_{Guid.NewGuid():N}.png");
        using var stream = File.Create(imagePath);
        var encoder = new PngBitmapEncoder();
        encoder.Frames.Add(BitmapFrame.Create(bitmap));
        encoder.Save(stream);

        return new PageImageExportResult
        {
            ImagePath = imagePath,
            Width = bitmap.PixelWidth,
            Height = bitmap.PixelHeight
        };
    }
}
