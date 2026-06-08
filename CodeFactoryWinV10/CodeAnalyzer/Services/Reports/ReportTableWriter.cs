using System.Text;

namespace CodeAnalyzer.Services.Reports;

internal static class ReportTableWriter
{
    public static void AppendHtmlTable(StringBuilder builder, ReportTable table)
    {
        builder.AppendLine("<table class=\"data\">");
        builder.AppendLine("<thead><tr>");
        foreach (var header in table.Headers)
        {
            builder.Append("<th>");
            builder.Append(ReportFormatting.EscapeHtml(header));
            builder.AppendLine("</th>");
        }

        builder.AppendLine("</tr></thead><tbody>");

        var riskColumnIndex = ReportFormatting.FindRiskColumnIndex(table.Headers);
        foreach (var row in table.Rows)
        {
            builder.AppendLine("<tr>");
            for (var index = 0; index < table.Headers.Count; index++)
            {
                var cell = index < row.Cells.Count ? row.Cells[index] : string.Empty;
                var isRiskCell = index == riskColumnIndex && row.RiskScore is not null;
                if (isRiskCell)
                {
                    var bg = ReportFormatting.RiskBackgroundHex(row.RiskScore);
                    var fg = ReportFormatting.RiskForegroundHex(row.RiskScore);
                    builder.Append(
                        $"<td style=\"background:{bg};color:{fg};font-weight:600\">");
                }
                else
                {
                    builder.Append("<td>");
                }

                builder.Append(ReportFormatting.EscapeHtml(cell));
                builder.AppendLine("</td>");
            }

            builder.AppendLine("</tr>");
        }

        builder.AppendLine("</tbody></table>");
    }

    public static void AppendMarkdownTable(StringBuilder builder, ReportTable table)
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
