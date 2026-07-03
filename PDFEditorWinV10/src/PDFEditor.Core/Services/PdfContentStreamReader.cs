using System.Text;
using iText.Kernel.Pdf;

namespace PDFEditor.Core.Services;

internal static class PdfContentStreamReader
{
    public static IReadOnlyList<byte[]> ReadPageStreams(PdfPage page)
    {
        var streams = new List<byte[]>();
        var contents = page.GetPdfObject().Get(PdfName.Contents);

        switch (contents)
        {
            case PdfStream single:
                streams.Add(single.GetBytes());
                break;
            case PdfArray array:
                for (var i = 0; i < array.Size(); i++)
                {
                    if (array.Get(i) is PdfStream stream)
                    {
                        streams.Add(stream.GetBytes());
                    }
                }

                break;
        }

        return streams;
    }

    public static string ToBase64(byte[] data) => Convert.ToBase64String(data);

    public static byte[] FromBase64(string dataBase64) => Convert.FromBase64String(dataBase64);

    public static string DecodeForInspection(byte[] data)
    {
        try
        {
            return Encoding.Latin1.GetString(data);
        }
        catch
        {
            return string.Empty;
        }
    }
}
