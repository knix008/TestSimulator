using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using PdfSharp.Drawing;
using PdfSharp.Pdf;

namespace Image2TextWin;

public static class ExportManager
{
    public static void ExportHtml(string asciiText, string filePath, string fontName = "Consolas",
        float fontSize = 4f, bool isColored = false,
        List<(int Row, int Col, System.Drawing.Color Color)>? colorData = null)
    {
        var lines = asciiText.Split('\n');

        var sb = new System.Text.StringBuilder();
        sb.AppendLine("<!DOCTYPE html>");
        sb.AppendLine("<html lang=\"ko\">");
        sb.AppendLine("<head>");
        sb.AppendLine("<meta charset=\"UTF-8\">");
        sb.AppendLine("<title>ASCII Art</title>");
        sb.AppendLine("<style>");
        sb.AppendLine("body { background: #000; margin: 0; padding: 10px; }");
        sb.AppendLine($"pre {{ font-family: '{fontName}', 'Courier New', monospace; font-size: {fontSize}pt; line-height: 1.0; color: #fff; white-space: pre; }}");
        sb.AppendLine("</style>");
        sb.AppendLine("</head>");
        sb.AppendLine("<body><pre>");

        if (isColored && colorData != null)
        {
            var colorDict = colorData.ToDictionary(x => (x.Row, x.Col), x => x.Color);
            for (int r = 0; r < lines.Length; r++)
            {
                for (int c = 0; c < lines[r].Length; c++)
                {
                    char ch = lines[r][c];
                    if (colorDict.TryGetValue((r, c), out var col))
                    {
                        string hex = $"#{col.R:X2}{col.G:X2}{col.B:X2}";
                        sb.Append($"<span style=\"color:{hex}\">{HtmlEncode(ch)}</span>");
                    }
                    else
                    {
                        sb.Append(HtmlEncode(ch));
                    }
                }
                if (r < lines.Length - 1) sb.AppendLine();
            }
        }
        else
        {
            foreach (char ch in asciiText)
                sb.Append(HtmlEncode(ch));
        }

        sb.AppendLine();
        sb.AppendLine("</pre></body></html>");
        File.WriteAllText(filePath, sb.ToString(), System.Text.Encoding.UTF8);
    }

    private static string HtmlEncode(char ch) => ch switch
    {
        '&' => "&amp;",
        '<' => "&lt;",
        '>' => "&gt;",
        '"' => "&quot;",
        _ => ch.ToString()
    };

    public static void ExportPdf(string asciiText, string filePath,
        string fontName = "Consolas", float fontSize = 4f)
    {
        var lines = asciiText.Split('\n');
        if (lines.Length == 0) return;

        using var document = new PdfDocument();
        document.Info.Title = "ASCII Art";
        document.Info.Creator = "Image2TextWin";

        var xFont = new XFont(fontName, fontSize, XFontStyleEx.Regular);

        // 페이지 크기 계산을 위한 임시 측정
        double charW, charH;
        {
            var tmpPage = document.AddPage();
            using var tmpGfx = XGraphics.FromPdfPage(tmpPage);
            var sz = tmpGfx.MeasureString("W", xFont);
            charW = sz.Width;
            charH = sz.Height * 1.1;
            document.Pages.Remove(tmpPage);
        }

        int maxCols = lines.Length > 0 ? lines.Max(l => l.Length) : 80;
        double pageW = Math.Min(charW * maxCols + 24, 14400);
        double pageH = Math.Min(charH * lines.Length + 24, 14400);

        var page = document.AddPage();
        page.Width = XUnit.FromPoint(pageW);
        page.Height = XUnit.FromPoint(pageH);

        using var gfx = XGraphics.FromPdfPage(page);
        gfx.DrawRectangle(XBrushes.Black, 0, 0, pageW, pageH);

        var brush = new XSolidBrush(XColors.White);

        for (int i = 0; i < lines.Length; i++)
        {
            double y = 10 + (i + 1) * charH;
            if (y > pageH) break;
            if (lines[i].Length > 0)
                gfx.DrawString(lines[i], xFont, brush, 10, y);
        }

        document.Save(filePath);
    }

    public static void ExportWord(string asciiText, string filePath,
        string fontName = "Consolas", float fontSize = 4f)
    {
        using var doc = WordprocessingDocument.Create(filePath, WordprocessingDocumentType.Document);
        var mainPart = doc.AddMainDocumentPart();
        mainPart.Document = new Document();
        var body = new Body();
        mainPart.Document.AppendChild(body);

        var sectPr = new SectionProperties();
        sectPr.AppendChild(new PageMargin { Top = 360, Right = 360, Bottom = 360, Left = 360 });
        body.AppendChild(sectPr);

        string halfPts = ((int)(fontSize * 2)).ToString();

        foreach (var line in asciiText.Split('\n'))
        {
            var para = new Paragraph();
            var paraProps = new ParagraphProperties();
            paraProps.AppendChild(new SpacingBetweenLines { Line = "240", LineRule = LineSpacingRuleValues.Auto });
            para.AppendChild(paraProps);

            var run = new Run();
            var runProps = new RunProperties();
            runProps.AppendChild(new RunFonts { Ascii = fontName, HighAnsi = fontName, EastAsia = fontName });
            runProps.AppendChild(new FontSize { Val = halfPts });
            runProps.AppendChild(new FontSizeComplexScript { Val = halfPts });
            run.AppendChild(runProps);
            run.AppendChild(new Text(line) { Space = SpaceProcessingModeValues.Preserve });
            para.AppendChild(run);

            body.InsertBefore(para, sectPr);
        }

        mainPart.Document.Save();
    }
}
