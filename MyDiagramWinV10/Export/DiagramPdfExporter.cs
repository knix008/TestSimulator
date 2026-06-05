using System.Drawing.Imaging;
using MyDiagramWinV10.Models;
using PdfSharp.Drawing;
using PdfSharp.Pdf;

namespace MyDiagramWinV10.Export;

public static class DiagramPdfExporter
{
    public const string FileFilter = "PDF 문서 (*.pdf)|*.pdf";

    public static void Export(DiagramProject project, string path)
    {
        var bounds = DiagramExporter.CalculateBounds(project);
        if (bounds.Width <= 0 || bounds.Height <= 0)
            bounds = new RectangleF(0, 0, 800, 600);

        const float padding = 40f;
        var pageWidth = XUnit.FromPoint(bounds.Width + padding * 2);
        var pageHeight = XUnit.FromPoint(bounds.Height + padding * 2);

        using var document = new PdfDocument();
        document.Info.Title = project.Title;
        var page = document.AddPage();
        page.Width = pageWidth;
        page.Height = pageHeight;

        using var gfx = XGraphics.FromPdfPage(page);
        var back = XColor.FromArgb(project.CanvasBackColorArgb);
        gfx.DrawRectangle(new XSolidBrush(back), 0, 0, pageWidth.Point, pageHeight.Point);

        using var bitmap = RenderProjectBitmap(project, bounds, padding);
        using var stream = new MemoryStream();
        bitmap.Save(stream, ImageFormat.Png);
        stream.Position = 0;
        using var image = XImage.FromStream(stream);
        gfx.DrawImage(image, 0, 0, pageWidth.Point, pageHeight.Point);

        document.Save(path);
    }

    private static Bitmap RenderProjectBitmap(DiagramProject project, RectangleF bounds, float padding)
    {
        var exportSize = new Size(
            (int)Math.Ceiling(bounds.Width + padding * 2),
            (int)Math.Ceiling(bounds.Height + padding * 2));

        var tempPath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid():N}.png");
        try
        {
            DiagramExporter.ExportToImage(project, tempPath, ImageFormat.Png, exportSize);
            return new Bitmap(tempPath);
        }
        finally
        {
            if (File.Exists(tempPath))
                File.Delete(tempPath);
        }
    }
}
