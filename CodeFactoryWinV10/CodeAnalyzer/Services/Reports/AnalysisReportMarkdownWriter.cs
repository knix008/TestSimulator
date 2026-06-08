using System.Text;

namespace CodeAnalyzer.Services.Reports;

public static class AnalysisReportMarkdownWriter
{
    public static void Write(AnalysisReportDocument document, string filePath)
    {
        ReportChartWriterHelper.WriteChartFiles(filePath, document.Sections);

        var builder = new StringBuilder();
        builder.AppendLine($"# {document.Title}");
        builder.AppendLine();
        builder.AppendLine($"**루트:** `{document.RootDirectory}`  ");
        builder.AppendLine($"**생성:** {document.GeneratedAt:yyyy-MM-dd HH:mm:ss}");
        builder.AppendLine();

        foreach (var section in document.Sections)
        {
            var hashes = new string('#', Math.Clamp(section.Level, 1, 6));
            builder.AppendLine($"{hashes} {section.Heading}");
            builder.AppendLine();

            foreach (var paragraph in section.Paragraphs)
            {
                builder.AppendLine(paragraph);
                builder.AppendLine();
            }

            if (section.Charts.Count > 0)
            {
                ReportChartWriterHelper.AppendMarkdownCharts(builder, filePath, section.Charts);
            }

            if (section.SummaryParts.Count > 0)
            {
                ReportSectionContentWriter.AppendMarkdownSummaryParts(builder, filePath, section.SummaryParts);
            }

            foreach (var bullet in section.BulletItems)
            {
                builder.Append("- ");
                builder.AppendLine(ReportFormatting.EscapeMarkdownCell(bullet));
            }

            if (section.BulletItems.Count > 0)
            {
                builder.AppendLine();
            }

            if (section.Table is { Rows.Count: > 0 } table)
            {
                ReportTableWriter.AppendMarkdownTable(builder, table);
                builder.AppendLine();
            }
        }

        if (!string.IsNullOrWhiteSpace(document.FooterNote))
        {
            builder.AppendLine("---");
            builder.AppendLine();
            builder.AppendLine($"*{document.FooterNote}*");
        }

        File.WriteAllText(filePath, builder.ToString(), Encoding.UTF8);
    }
}
