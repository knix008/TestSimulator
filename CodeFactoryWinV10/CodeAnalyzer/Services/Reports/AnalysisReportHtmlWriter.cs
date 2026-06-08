using System.Text;

namespace CodeAnalyzer.Services.Reports;

public static class AnalysisReportHtmlWriter
{
    public static void Write(AnalysisReportDocument document, string filePath)
    {
        var builder = new StringBuilder();
        builder.AppendLine("<!DOCTYPE html>");
        builder.AppendLine("<html lang=\"ko\">");
        builder.AppendLine("<head>");
        builder.AppendLine("<meta charset=\"utf-8\" />");
        builder.AppendLine($"<title>{ReportFormatting.EscapeHtml(document.Title)}</title>");
        builder.AppendLine("<style>");
        builder.AppendLine(GetStyles());
        builder.AppendLine("</style>");
        builder.AppendLine("</head>");
        builder.AppendLine("<body>");

        builder.AppendLine($"<h1>{ReportFormatting.EscapeHtml(document.Title)}</h1>");
        builder.AppendLine("<p class=\"meta\">");
        builder.AppendLine($"<strong>루트:</strong> {ReportFormatting.EscapeHtml(document.RootDirectory)}<br />");
        builder.AppendLine($"<strong>생성:</strong> {document.GeneratedAt:yyyy-MM-dd HH:mm:ss}");
        builder.AppendLine("</p>");

        foreach (var section in document.Sections)
        {
            var tag = section.Level switch
            {
                1 => "h1",
                3 => "h3",
                4 => "h4",
                _ => "h2"
            };

            builder.AppendLine($"<{tag}>{ReportFormatting.EscapeHtml(section.Heading)}</{tag}>");

            foreach (var paragraph in section.Paragraphs)
            {
                builder.AppendLine($"<p>{ReportFormatting.EscapeHtml(paragraph)}</p>");
            }

            if (section.Charts.Count > 0)
            {
                ReportChartWriterHelper.AppendHtmlCharts(builder, section.Charts);
            }

            if (section.SummaryParts.Count > 0)
            {
                ReportSectionContentWriter.AppendHtmlSummaryParts(builder, section.SummaryParts);
            }

            if (section.BulletItems.Count > 0)
            {
                builder.AppendLine("<ul>");
                foreach (var bullet in section.BulletItems)
                {
                    builder.Append("<li>");
                    builder.Append(ReportFormatting.EscapeHtml(bullet));
                    builder.AppendLine("</li>");
                }

                builder.AppendLine("</ul>");
            }

            if (section.Table is { Rows.Count: > 0 } table)
            {
                ReportTableWriter.AppendHtmlTable(builder, table);
            }
        }

        if (!string.IsNullOrWhiteSpace(document.FooterNote))
        {
            builder.AppendLine($"<footer><p>{ReportFormatting.EscapeHtml(document.FooterNote)}</p></footer>");
        }

        builder.AppendLine("</body></html>");
        File.WriteAllText(filePath, builder.ToString(), Encoding.UTF8);
    }

    private static string GetStyles() => """
        body { font-family: "Segoe UI", Malgun Gothic, sans-serif; margin: 2rem; color: #1e293b; line-height: 1.5; }
        h1 { border-bottom: 2px solid #334155; padding-bottom: 0.4rem; }
        h2 { margin-top: 2rem; color: #0f172a; }
        h3 { margin-top: 1.25rem; color: #1e293b; font-size: 1.05rem; }
        .meta { color: #475569; }
        table.data { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.9rem; }
        table.data th, table.data td { border: 1px solid #cbd5e1; padding: 0.35rem 0.5rem; text-align: left; vertical-align: top; }
        table.data th { background: #f1f5f9; }
        table.data tr:nth-child(even) { background: #f8fafc; }
        figure.report-chart { margin: 1rem 0; }
        figure.report-chart img { max-width: 100%; height: auto; border: 1px solid #e2e8f0; border-radius: 4px; background: #eef2f8; }
        footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 0.85rem; }
        """;
}
