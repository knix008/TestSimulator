using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;

namespace CodeAnalyzer.Services.Reports;

public static class AnalysisReportDocxWriter
{
    public static void Write(AnalysisReportDocument document, string filePath)
    {
        if (File.Exists(filePath))
        {
            File.Delete(filePath);
        }

        using var wordDoc = WordprocessingDocument.Create(filePath, WordprocessingDocumentType.Document);
        var mainPart = wordDoc.AddMainDocumentPart();
        mainPart.Document = new Document(new Body());
        var body = mainPart.Document.Body!;

        AddHeading(body, document.Title, 1);
        AddParagraph(body, $"루트: {document.RootDirectory}");
        AddParagraph(body, $"생성: {document.GeneratedAt:yyyy-MM-dd HH:mm:ss}");
        AddParagraph(body, string.Empty);

        foreach (var section in document.Sections)
        {
            AddHeading(body, section.Heading, Math.Clamp(section.Level, 1, 3));
            foreach (var paragraph in section.Paragraphs)
            {
                AddParagraph(body, paragraph);
            }

            if (section.Table is { Rows.Count: > 0 } table)
            {
                AddTable(body, table);
            }

            AddParagraph(body, string.Empty);
        }

        if (!string.IsNullOrWhiteSpace(document.FooterNote))
        {
            AddParagraph(body, document.FooterNote, italic: true);
        }

        mainPart.Document.Save();
    }

    private static void AddHeading(Body body, string text, int level)
    {
        var styleId = level switch
        {
            1 => "Heading1",
            3 => "Heading3",
            _ => "Heading2"
        };

        var paragraph = new Paragraph(
            new ParagraphProperties(new ParagraphStyleId { Val = styleId }),
            new Run(new Text(text) { Space = SpaceProcessingModeValues.Preserve }));
        body.Append(paragraph);
    }

    private static void AddParagraph(Body body, string text, bool italic = false)
    {
        var runProperties = italic ? new RunProperties(new Italic()) : null;
        var run = runProperties is null
            ? new Run(new Text(text) { Space = SpaceProcessingModeValues.Preserve })
            : new Run(runProperties, new Text(text) { Space = SpaceProcessingModeValues.Preserve });
        body.Append(new Paragraph(run));
    }

    private static void AddTable(Body body, ReportTable table)
    {
        var riskColumnIndex = FindRiskScoreColumnIndex(table.Headers);
        var wordTable = new Table();
        wordTable.AppendChild(new TableProperties(
            new TableBorders(
                new TopBorder { Val = BorderValues.Single, Size = 4 },
                new BottomBorder { Val = BorderValues.Single, Size = 4 },
                new LeftBorder { Val = BorderValues.Single, Size = 4 },
                new RightBorder { Val = BorderValues.Single, Size = 4 },
                new InsideHorizontalBorder { Val = BorderValues.Single, Size = 4 },
                new InsideVerticalBorder { Val = BorderValues.Single, Size = 4 })));

        wordTable.Append(BuildHeaderRow(table.Headers));

        foreach (var row in table.Rows)
        {
            wordTable.Append(BuildDataRow(table.Headers.Count, row, riskColumnIndex));
        }

        body.Append(wordTable);
    }

    private static TableRow BuildHeaderRow(IReadOnlyList<string> headers)
    {
        var row = new TableRow();
        foreach (var header in headers)
        {
            row.Append(CreateCell(header, bold: true, fillHex: "F1F5F9"));
        }

        return row;
    }

    private static TableRow BuildDataRow(int columnCount, ReportTableRow row, int riskColumnIndex)
    {
        var tableRow = new TableRow();
        for (var index = 0; index < columnCount; index++)
        {
            var text = index < row.Cells.Count ? row.Cells[index] : string.Empty;
            string? fill = null;
            if (index == riskColumnIndex && row.RiskScore is not null)
            {
                var color = ReportFormatting.RiskToBackColor(row.RiskScore.Value);
                fill = $"{color.R:X2}{color.G:X2}{color.B:X2}";
            }

            tableRow.Append(CreateCell(text, fillHex: fill));
        }

        return tableRow;
    }

    private static TableCell CreateCell(string text, bool bold = false, string? fillHex = null)
    {
        var properties = new TableCellProperties(
            new TableCellWidth { Type = TableWidthUnitValues.Auto });

        if (!string.IsNullOrEmpty(fillHex))
        {
            properties.Append(new Shading
            {
                Val = ShadingPatternValues.Clear,
                Fill = fillHex
            });
        }

        var runProperties = bold ? new RunProperties(new Bold()) : null;
        var run = runProperties is null
            ? new Run(new Text(text) { Space = SpaceProcessingModeValues.Preserve })
            : new Run(runProperties, new Text(text) { Space = SpaceProcessingModeValues.Preserve });

        return new TableCell(properties, new Paragraph(run));
    }

    private static int FindRiskScoreColumnIndex(IReadOnlyList<string> headers)
    {
        for (var index = 0; index < headers.Count; index++)
        {
            if (headers[index].Contains("위험", StringComparison.Ordinal))
            {
                return index;
            }
        }

        return -1;
    }
}
