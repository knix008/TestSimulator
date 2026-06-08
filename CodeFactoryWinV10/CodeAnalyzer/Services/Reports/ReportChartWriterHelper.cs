using System.Text;

namespace CodeAnalyzer.Services.Reports;

internal static class ReportChartWriterHelper
{
    public static string ResolveChartsDirectory(string reportFilePath) =>
        Path.Combine(
            Path.GetDirectoryName(reportFilePath) ?? string.Empty,
            Path.GetFileNameWithoutExtension(reportFilePath) + "_charts");

    public static string ResolveRelativeChartPath(string reportFilePath, ReportChartImage chart) =>
        Path.GetFileName(ResolveChartsDirectory(reportFilePath)) + "/" + chart.FileName;

    public static void WriteChartFiles(string reportFilePath, IEnumerable<ReportSection> sections)
    {
        var charts = sections.SelectMany(ReportSectionContentWriter.EnumerateCharts).ToList();
        if (charts.Count == 0)
        {
            return;
        }

        var chartsDirectory = ResolveChartsDirectory(reportFilePath);
        Directory.CreateDirectory(chartsDirectory);

        foreach (var chart in charts)
        {
            File.WriteAllBytes(Path.Combine(chartsDirectory, chart.FileName), chart.PngBytes);
        }
    }

    public static string ToBase64DataUri(ReportChartImage chart) =>
        $"data:image/png;base64,{Convert.ToBase64String(chart.PngBytes)}";

    public static void AppendHtmlCharts(StringBuilder builder, IReadOnlyList<ReportChartImage> charts)
    {
        foreach (var chart in charts)
        {
            builder.AppendLine(
                $"""<figure class="report-chart"><img src="{ToBase64DataUri(chart)}" alt="{ReportFormatting.EscapeHtml(chart.AltText)}" width="{chart.Width}" height="{chart.Height}" /></figure>""");
        }
    }

    public static void AppendMarkdownCharts(StringBuilder builder, string reportFilePath, IReadOnlyList<ReportChartImage> charts)
    {
        foreach (var chart in charts)
        {
            var relativePath = ResolveRelativeChartPath(reportFilePath, chart);
            builder.Append("![");
            builder.Append(ReportFormatting.EscapeMarkdownCell(chart.AltText));
            builder.Append("](");
            builder.Append(relativePath.Replace('\\', '/'));
            builder.AppendLine(")");
        }

        if (charts.Count > 0)
        {
            builder.AppendLine();
        }
    }
}
