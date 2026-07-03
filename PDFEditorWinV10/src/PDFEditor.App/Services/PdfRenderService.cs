using System.IO;
using System.Windows.Media.Imaging;
using Docnet.Core;
using Docnet.Core.Models;
using Docnet.Core.Readers;

namespace PDFEditor.App.Services;

public interface IPdfRenderService
{
    BitmapSource? RenderPage(string pdfPath, int pageIndex, double scale = 1.5);
    int GetPageCount(string pdfPath);
}

public sealed class PdfRenderService : IPdfRenderService, IDisposable
{
    private readonly DocLib _docLib = DocLib.Instance;

    public int GetPageCount(string pdfPath)
    {
        using var docReader = _docLib.GetDocReader(pdfPath, new PageDimensions(1.0));
        return docReader.GetPageCount();
    }

    public BitmapSource? RenderPage(string pdfPath, int pageIndex, double scale = 1.5)
    {
        using var docReader = _docLib.GetDocReader(pdfPath, new PageDimensions(scale));
        if (pageIndex < 0 || pageIndex >= docReader.GetPageCount())
        {
            return null;
        }

        using var pageReader = docReader.GetPageReader(pageIndex);
        var width = pageReader.GetPageWidth();
        var height = pageReader.GetPageHeight();
        var rawBytes = pageReader.GetImage();
        var stride = width * 4;

        var bitmap = BitmapSource.Create(
            width,
            height,
            96,
            96,
            System.Windows.Media.PixelFormats.Bgra32,
            null,
            rawBytes,
            stride);

        bitmap.Freeze();
        return bitmap;
    }

    public void Dispose() => _docLib.Dispose();
}
