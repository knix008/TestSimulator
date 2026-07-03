using iText.Kernel.Font;
using iText.Kernel.Pdf;
using PDFEditor.Core.Models;

namespace PDFEditor.Core.Services;

internal static class PdfFontExtractor
{
    public static IList<FontModel> ExtractDocumentFonts(PdfDocument pdfDoc)
    {
        var fonts = new Dictionary<string, FontModel>(StringComparer.Ordinal);

        for (var i = 1; i <= pdfDoc.GetNumberOfPages(); i++)
        {
            var page = pdfDoc.GetPage(i);
            var resources = page.GetResources();
            if (resources is null)
            {
                continue;
            }

            var fontResource = resources.GetResource(PdfName.Font) as PdfDictionary;
            if (fontResource is null)
            {
                continue;
            }

            foreach (var key in fontResource.KeySet())
            {
                var fontName = key.ToString();
                if (fonts.ContainsKey(fontName))
                {
                    continue;
                }

                if (fontResource.Get(key) is not PdfDictionary fontDictionary)
                {
                    continue;
                }

                var baseFont = fontDictionary.GetAsName(PdfName.BaseFont)?.GetValue();
                var encoding = fontDictionary.GetAsName(PdfName.Encoding)?.GetValue();
                var embedded = fontDictionary.ContainsKey(PdfName.FontDescriptor);

                fonts[fontName] = new FontModel
                {
                    Id = fontName.TrimStart('/'),
                    Name = baseFont?.TrimStart('/') ?? fontName.TrimStart('/'),
                    Embedded = embedded,
                    Encoding = encoding?.TrimStart('/')
                };
            }
        }

        return fonts.Values.ToList();
    }

    public static PdfFont? ResolveFont(PdfPage page, string? fontRefId)
    {
        if (string.IsNullOrWhiteSpace(fontRefId))
        {
            return null;
        }

        var resources = page.GetResources();
        var fontDict = resources?.GetResource(PdfName.Font) as PdfDictionary;
        if (fontDict is null)
        {
            return null;
        }

        foreach (var key in fontDict.KeySet())
        {
            var fontObject = fontDict.Get(key);
            var refString = fontObject?.GetIndirectReference()?.ToString();
            if (string.Equals(refString, fontRefId, StringComparison.Ordinal))
            {
                if (fontObject is PdfDictionary dictionary)
                {
                    return PdfFontFactory.CreateFont(dictionary);
                }
            }

            if (string.Equals(key.ToString().TrimStart('/'), fontRefId.TrimStart('/'), StringComparison.OrdinalIgnoreCase))
            {
                if (fontObject is PdfDictionary dictionary)
                {
                    return PdfFontFactory.CreateFont(dictionary);
                }
            }
        }

        return null;
    }
}
