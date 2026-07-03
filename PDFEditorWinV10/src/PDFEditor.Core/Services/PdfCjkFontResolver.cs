using System.Text;
using iText.IO.Font;
using iText.IO.Font.Constants;
using iText.Kernel.Font;
using iText.Kernel.Pdf;
using PDFEditor.Core.Models;

namespace PDFEditor.Core.Services;

internal static class PdfCjkFontResolver
{
    private static readonly (string Font, string Encoding)[] CjkFontCandidates =
    [
        ("HYGoThic-Medium", "UniKS-UCS2-H"),
        ("HYSMyeongJo-Medium", "UniKS-UCS2-H"),
        ("STSongStd-Light", "UniGB-UCS2-H"),
        ("STSong-Light", "UniGB-UCS2-H"),
        ("KozMinPro-Regular", "UniJIS-UCS2-H"),
        ("HeiseiMin-W3", "UniJIS-UCS2-H")
    ];

    public static bool ContainsCjk(string? text)
    {
        if (string.IsNullOrEmpty(text))
        {
            return false;
        }

        foreach (var ch in text)
        {
            if (IsCjkCharacter(ch))
            {
                return true;
            }
        }

        return false;
    }

    public static PdfFont Resolve(PdfPage page, TextElement element, PdfDocument pdfDoc)
    {
        if (ContainsCjk(element.Text))
        {
            foreach (var (fontName, encoding) in CjkFontCandidates)
            {
                try
                {
                    return PdfFontFactory.CreateFont(fontName, encoding, pdfDoc);
                }
                catch
                {
                    // Try next bundled font.
                }
            }
        }

        var fromPage = PdfTextApplier.ResolveFontFromPage(page, element);
        return fromPage ?? PdfFontFactory.CreateFont(StandardFonts.HELVETICA);
    }

    private static bool IsCjkCharacter(char ch) =>
        ch is >= '\u1100' and <= '\u11FF' or
               >= '\u2E80' and <= '\u9FFF' or
               >= '\uAC00' and <= '\uD7AF' or
               >= '\uF900' and <= '\uFAFF' or
               >= '\uFE30' and <= '\uFE4F' or
               >= '\uFF00' and <= '\uFFEF';
}
