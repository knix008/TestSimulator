using System.Text;

namespace CodeAnalyzer.Services.Reports;

public static class AnalysisReportMarkdownWriter
{
    public static void Write(AnalysisReportDocument document, string filePath)
    {
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
                WriteTable(builder, table);
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

    private static void WriteTable(StringBuilder builder, ReportTable table)
    {
        builder.Append('|');
        foreach (var header in table.Headers)
        {
            builder.Append(' ');
            builder.Append(ReportFormatting.EscapeMarkdownCell(header));
            builder.Append(" |");
        }

        builder.AppendLine();

        builder.Append("|");
        foreach (var _ in table.Headers)
        {
            builder.Append(" --- |");
        }

        builder.AppendLine();

        foreach (var row in table.Rows)
        {
            builder.Append('|');
            for (var index = 0; index < table.Headers.Count; index++)
            {
                var cell = index < row.Cells.Count ? row.Cells[index] : string.Empty;
                builder.Append(' ');
                builder.Append(ReportFormatting.EscapeMarkdownCell(cell));
                builder.Append(" |");
            }

            builder.AppendLine();
        }
    }
}
