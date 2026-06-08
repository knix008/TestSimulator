using CodeAnalyzer.Controls;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.Reports;

internal static class AnalysisReportSummaryBuilder
{
    public static ReportSection? BuildSection(AnalysisResult analysis)
    {
        var snapshot = AnalysisSummarySnapshotBuilder.Build(analysis);
        if (snapshot.Areas.Count == 0 && snapshot.RadarAxes.Count == 0)
        {
            return null;
        }

        var chartSections = AnalysisSummarySectionBuilder.Build(analysis);
        var chartIndex = 0;
        var parts = new List<ReportSummaryPart>();

        foreach (var chartSection in chartSections)
        {
            parts.Add(new ReportSummaryPart
            {
                Title = chartSection.Title,
                SummaryText = chartSection.SummaryText,
                Chart = RenderChart(chartSection, ref chartIndex),
                Table = ResolveTable(chartSection.Title, snapshot)
            });
        }

        return new ReportSection
        {
            Heading = "2. 품질 Summary",
            Level = 2,
            Paragraphs =
            [
                "앱의 「분석 Summary」 뷰와 동일한 품질 중심 요약입니다. " +
                "분석 범위에서 제외된 항목은 표시되지 않으며, 아래 차트와 표는 개선이 필요한 품질 지표를 영역별로 보여 줍니다."
            ],
            SummaryParts = parts
        };
    }

    private static ReportTable? ResolveTable(string title, AnalysisSummarySnapshot snapshot)
    {
        if (string.Equals(title, "품질 개선 레이더", StringComparison.Ordinal))
        {
            if (snapshot.RadarAxes.Count == 0)
            {
                return null;
            }

            return new ReportTable
            {
                Headers = ["개선 목표", "측정 내용", "건강도"],
                Rows = snapshot.RadarAxes
                    .Select(axis => new ReportTableRow
                    {
                        Cells =
                        [
                            axis.Label,
                            axis.Detail ?? string.Empty,
                            $"{axis.Score:0.#}"
                        ]
                    })
                    .ToList()
            };
        }

        var area = snapshot.Areas.FirstOrDefault(candidate =>
            string.Equals(candidate.Title, title, StringComparison.Ordinal));
        return area is null ? null : BuildMetricsTable(area.Title, area.Metrics);
    }

    private static ReportChartImage? RenderChart(SummarySection section, ref int chartIndex)
    {
        if (section.ChartKind == SummaryChartKind.None)
        {
            return null;
        }

        var width = section.IsFullWidth ? 920 : 520;
        var height = section.IsFullWidth ? 360 : 380;
        var pngBytes = SummaryChartRenderer.RenderToPng(section, width, height);
        if (pngBytes is null || pngBytes.Length == 0)
        {
            return null;
        }

        chartIndex++;
        return new ReportChartImage
        {
            FileName = $"summary-chart-{chartIndex:00}.png",
            PngBytes = pngBytes,
            AltText = section.Title,
            Width = width,
            Height = height
        };
    }

    private static ReportTable? BuildMetricsTable(string areaTitle, IReadOnlyList<AnalysisSummaryMetricRow> metrics)
    {
        if (metrics.Count == 0)
        {
            return null;
        }

        if (areaTitle == "분석 주의")
        {
            return new ReportTable
            {
                Headers = ["단계", "메시지"],
                Rows = metrics
                    .Select(metric => new ReportTableRow
                    {
                        Cells = [metric.Label, metric.Detail ?? string.Empty]
                    })
                    .ToList()
            };
        }

        var rows = metrics.Select(metric => new ReportTableRow
        {
            Cells =
            [
                metric.Label,
                FormatMetricValue(metric),
                metric.Detail ?? string.Empty
            ]
        }).ToList();

        return new ReportTable
        {
            Headers = ["항목", "값", "비고"],
            Rows = rows
        };
    }

    private static string FormatMetricValue(AnalysisSummaryMetricRow metric)
    {
        if (metric.Label.Contains("중복률", StringComparison.Ordinal))
        {
            return $"{metric.Value:F1}%";
        }

        return Math.Abs(metric.Value - Math.Truncate(metric.Value)) < 0.001
            ? metric.Value.ToString("N0")
            : metric.Value.ToString("0.#");
    }
}
