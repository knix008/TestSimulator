using MyUML20WinV10.Models;
using PdfSharp.Drawing;
using PdfSharp.Pdf;
using System.Drawing.Imaging;

namespace MyUML20WinV10.Export;
public static class UmlDiagramPdfExporter
{
    public const string FileFilter = "PDF 문서 (*.pdf)|*.pdf";

    public static void Export(UmlProject project, UmlDiagram diagram, string path, UmlImageExportOptions options)
    {
#if DESIGNER
        _ = project;
        _ = diagram;
        _ = path;
        _ = options;
#else
        var bounds = UmlDiagramLayout.CalculateBounds(project, diagram);
        if (bounds.Width <= 0 || bounds.Height <= 0)
            bounds = new RectangleF(0, 0, 800, 600);

        var pageWidth = XUnit.FromPoint(bounds.Width + options.Padding * 2);
        var pageHeight = XUnit.FromPoint(bounds.Height + options.Padding * 2);

        using var document = new PdfDocument();
        document.Info.Title = $"{project.Name} - {diagram.Name}";
        var page = document.AddPage();
        page.Width = pageWidth;
        page.Height = pageHeight;

        using var gfx = XGraphics.FromPdfPage(page);
        if (!options.TransparentBackground)
        {
            var back = XColor.FromArgb(options.BackgroundColor.A, options.BackgroundColor.R, options.BackgroundColor.G, options.BackgroundColor.B);
            gfx.DrawRectangle(new XSolidBrush(back), 0, 0, pageWidth.Point, pageHeight.Point);
        }

        using var bitmap = UmlDiagramImageExporter.RenderBitmap(project, diagram, options, useTransparency: options.TransparentBackground);
        using var stream = new MemoryStream();
        bitmap.Save(stream, ImageFormat.Png);
        stream.Position = 0;
        using var image = XImage.FromStream(stream);
        gfx.DrawImage(image, 0, 0, pageWidth.Point, pageHeight.Point);

        document.Save(path);
#endif
    }
}
