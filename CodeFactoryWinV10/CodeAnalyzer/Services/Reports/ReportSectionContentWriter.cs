using System.Text;

namespace CodeAnalyzer.Services.Reports;

internal static class ReportSectionContentWriter
{
    public static IEnumerable<ReportChartImage> EnumerateCharts(ReportSection section)
    {
        foreach (var chart in section.Charts)
        {
            yield return chart;
        }

        foreach (var part in section.SummaryParts)
        {
            if (part.Chart is not null)
            {
                yield return part.Chart;
            }
        }
    }

    public static void AppendHtmlSummaryParts(StringBuilder builder, IReadOnlyList<ReportSummaryPart> parts)
    {
        foreach (var part in parts)
        {
            builder.AppendLine($"<h3>{ReportFormatting.EscapeHtml(part.Title)}</h3>");
            builder.AppendLine($"<p>{ReportFormatting.EscapeHtml(part.SummaryText)}</p>");

            if (part.Chart is not null)
            {
                ReportChartWriterHelper.AppendHtmlCharts(builder, [part.Chart]);
            }

            if (part.Table is { Rows.Count: > 0 } table)
            {
                ReportTableWriter.AppendHtmlTable(builder, table);
            }
        }
    }

    public static void AppendMarkdownSummaryParts(
        StringBuilder builder,
        string reportFilePath,
        IReadOnlyList<ReportSummaryPart> parts)
    {
        foreach (var part in parts)
        {
            builder.AppendLine($"### {part.Title}");
            builder.AppendLine();
            builder.AppendLine(part.SummaryText);
            builder.AppendLine();

            if (part.Chart is not null)
            {
                ReportChartWriterHelper.AppendMarkdownCharts(builder, reportFilePath, [part.Chart]);
            }

            if (part.Table is { Rows.Count: > 0 } table)
            {
                ReportTableWriter.AppendMarkdownTable(builder, table);
                builder.AppendLine();
            }
        }
    }
}
