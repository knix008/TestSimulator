using Windows.Data.Pdf;
using Windows.Storage;
using Windows.Storage.Streams;
using System.Drawing.Imaging;

namespace OCRWinV10;

public static class PdfRenderer
{
    public static async Task<List<Bitmap>> RenderPagesAsync(string pdfPath, double dpi = 200.0)
    {
        var file = await StorageFile.GetFileFromPathAsync(pdfPath);
        var pdfDoc = await PdfDocument.LoadFromFileAsync(file);

        var bitmaps = new List<Bitmap>();
        double scale = dpi / 96.0;

        for (uint i = 0; i < pdfDoc.PageCount; i++)
        {
            using var page = pdfDoc.GetPage(i);
            var options = new PdfPageRenderOptions
            {
                DestinationWidth = (uint)(page.Size.Width * scale),
                DestinationHeight = (uint)(page.Size.Height * scale)
            };

            using var stream = new InMemoryRandomAccessStream();
            await page.RenderToStreamAsync(stream, options);
            stream.Seek(0);

            bitmaps.Add(new Bitmap(stream.AsStreamForRead()));
        }

        return bitmaps;
    }
}
