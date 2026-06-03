using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace CodeAnalyzer.Services.Reports;

public static class AnalysisReportPdfWriter
{
    private static bool _licenseConfigured;

    public static void Write(AnalysisReportDocument document, string filePath)
    {
        EnsureLicense();

        Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(40);
                page.DefaultTextStyle(style => style.FontSize(9));

                page.Header().Text(document.Title).Bold().FontSize(16);
                page.Footer().AlignCenter().Text(text =>
                {
                    text.Span("Page ");
                    text.CurrentPageNumber();
                    text.Span(" / ");
                    text.TotalPages();
                });

                page.Content().Column(column =>
                {
                    column.Spacing(8);
                    column.Item().Text($"루트: {document.RootDirectory}").FontColor(Colors.Grey.Darken2);
                    column.Item().Text($"생성: {document.GeneratedAt:yyyy-MM-dd HH:mm:ss}")
                        .FontColor(Colors.Grey.Darken2);

                    foreach (var section in document.Sections)
                    {
                        column.Item().PaddingTop(10).Text(section.Heading).Bold().FontSize(12);

                        foreach (var paragraph in section.Paragraphs)
                        {
                            column.Item().Text(paragraph);
                        }

                        if (section.Table is { Rows.Count: > 0 } table)
                        {
                            column.Item().Element(container => WriteTable(container, table));
                        }
                    }

                    if (!string.IsNullOrWhiteSpace(document.FooterNote))
                    {
                        column.Item().PaddingTop(12).Text(document.FooterNote)
                            .Italic()
                            .FontColor(Colors.Grey.Darken1)
                            .FontSize(8);
                    }
                });
            });
        }).GeneratePdf(filePath);
    }

    private static void EnsureLicense()
    {
        if (_licenseConfigured)
        {
            return;
        }

        QuestPDF.Settings.License = LicenseType.Community;
        _licenseConfigured = true;
    }

    private static void WriteTable(IContainer container, ReportTable table)
    {
        var riskColumnIndex = FindRiskScoreColumnIndex(table.Headers);

        container.Table(tableDescriptor =>
        {
            tableDescriptor.ColumnsDefinition(columns =>
            {
                foreach (var _ in table.Headers)
                {
                    columns.RelativeColumn();
                }
            });

            tableDescriptor.Header(header =>
            {
                foreach (var headerText in table.Headers)
                {
                    header.Cell().Background(Colors.Grey.Lighten3).Padding(4)
                        .Text(headerText).Bold();
                }
            });

            foreach (var row in table.Rows)
            {
                for (var index = 0; index < table.Headers.Count; index++)
                {
                    var cellText = index < row.Cells.Count ? row.Cells[index] : string.Empty;
                    var cell = tableDescriptor.Cell().Padding(4);

                    if (index == riskColumnIndex && row.RiskScore is not null)
                    {
                        var color = ReportFormatting.RiskToBackColor(row.RiskScore.Value);
                        cell.Background(ToQuestColor(color)).Text(cellText);
                    }
                    else
                    {
                        cell.Text(cellText);
                    }
                }
            }
        });
    }

    private static string ToQuestColor(System.Drawing.Color color)
        => $"#{color.R:X2}{color.G:X2}{color.B:X2}";

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
