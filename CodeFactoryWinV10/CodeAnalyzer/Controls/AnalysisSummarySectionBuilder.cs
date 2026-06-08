using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

internal static class AnalysisSummarySectionBuilder
{
    private static readonly Color Primary = Color.FromArgb(74, 108, 155);
    private static readonly Color Accent = Color.FromArgb(52, 152, 219);
    private static readonly Color Success = Color.FromArgb(39, 174, 96);
    private static readonly Color Warning = Color.FromArgb(241, 196, 15);
    private static readonly Color Critical = Color.FromArgb(231, 76, 60);
    private static readonly Color Muted = Color.FromArgb(149, 165, 166);
    private static readonly Color Purple = Color.FromArgb(142, 68, 173);
    private static readonly Color Orange = Color.FromArgb(230, 126, 34);

    public static IReadOnlyList<SummarySection> Build(AnalysisResult? analysis)
    {
        if (analysis is null)
        {
            return [];
        }

        var snapshot = AnalysisSummarySnapshotBuilder.Build(analysis);
        var sections = new List<SummarySection>();
        var radarSection = MapRadar(snapshot.RadarAxes);
        if (radarSection is not null)
        {
            sections.Add(radarSection);
        }

        sections.AddRange(snapshot.Areas.Select(MapArea));
        return sections;
    }

    private static SummarySection? MapRadar(IReadOnlyList<AnalysisSummaryRadarAxis> axes)
    {
        if (axes.Count == 0)
        {
            return null;
        }

        var average = axes.Average(axis => axis.Score);
        if (axes.Count >= 3)
        {
            return new SummarySection
            {
                Title = "품질 개선 레이더",
                SummaryText =
                    $"선택된 {axes.Count}개 개선 목표의 건강도입니다. 평균 {average:0.#}점 (100점 만점, 낮을수록 우선 개선).",
                ChartKind = SummaryChartKind.Radar,
                IsFullWidth = true,
                RadarAxes = axes
                    .Select(axis => new SummaryRadarAxisItem(axis.Label, axis.Score, axis.Detail))
                    .ToList()
            };
        }

        return new SummarySection
        {
            Title = "품질 개선 레이더",
            SummaryText =
                $"선택된 {axes.Count}개 개선 목표의 건강도입니다. 평균 {average:0.#}점 (100점 만점, 낮을수록 우선 개선).",
            ChartKind = SummaryChartKind.PieGrid,
            IsFullWidth = true,
            PieItems = axes
                .Select(axis => new SummaryMiniPieItem(axis.Label, axis.Score, 100, ScoreColor(axis.Score)))
                .ToList()
        };
    }

    private static SummarySection MapArea(AnalysisSummaryArea area) => area.Kind switch
    {
        SummaryAreaKind.Overview => MapOverview(area),
        SummaryAreaKind.CallGraph => MapCallGraph(area),
        SummaryAreaKind.Quality => MapQuality(area),
        SummaryAreaKind.Duplicates => MapDuplicates(area),
        SummaryAreaKind.Structure => MapStructure(area),
        SummaryAreaKind.Relations => MapCoupling(area),
        SummaryAreaKind.Globals => MapGlobals(area),
        SummaryAreaKind.Database => MapDatabase(area),
        SummaryAreaKind.BugRisk => MapBugRisk(area),
        SummaryAreaKind.Issues => MapIssues(area),
        _ => MapRatioPieGrid(area, area.Metrics, SumPositive(area.Metrics))
    };

    private static SummarySection MapOverview(AnalysisSummaryArea area)
    {
        var scoreMetric = area.Metrics.FirstOrDefault(metric => metric.Label == "품질 점수");
        var chartMetrics = area.Metrics.Where(metric => metric.Label != "품질 점수").ToList();
        var totalFunctions = SumFunctionStatus(area.Metrics);

        return new SummarySection
        {
            Title = area.Title,
            SummaryText = area.SummaryText,
            ChartKind = SummaryChartKind.PieGrid,
            Kpis = scoreMetric is null
                ? []
                : [new SummaryKpiItem("품질 점수", FormatScore(scoreMetric.Value))],
            PieItems = ToRatioPies(chartMetrics, totalFunctions)
        };
    }

    private static SummarySection MapCallGraph(AnalysisSummaryArea area)
    {
        var buckets = area.Metrics.Skip(3).Take(4).ToList();
        var totalNodes = Math.Max(1, SumPositive(buckets));
        var headline = area.Metrics.Take(3).ToList();
        var files = area.Metrics.Skip(7).Take(4).ToList();
        var totalWarnings = Math.Max(1, SumPositive(files));
        var items = new List<SummaryMiniPieItem>();
        items.AddRange(ToRatioPies(headline, totalNodes));
        items.AddRange(ToCompositionPies(buckets));
        items.AddRange(ToRatioPies(files, totalWarnings));

        return new SummarySection
        {
            Title = area.Title,
            SummaryText = area.SummaryText,
            ChartKind = SummaryChartKind.PieGrid,
            PieItems = items
        };
    }

    private static SummarySection MapQuality(AnalysisSummaryArea area)
    {
        var totalFunctions = SumFunctionStatus(area.Metrics);
        var warn = area.Metrics.FirstOrDefault(metric => metric.Label == "경고 함수")?.Value ?? 0;
        var critical = area.Metrics.FirstOrDefault(metric => metric.Label == "심각 함수")?.Value ?? 0;

        return new SummarySection
        {
            Title = area.Title,
            SummaryText = area.SummaryText,
            ChartKind = SummaryChartKind.PieGrid,
            Kpis =
            [
                new SummaryKpiItem("개선 필요", FormatValue(warn + critical)),
                new SummaryKpiItem("심각", FormatValue(critical))
            ],
            PieItems = ToRatioPies(area.Metrics, totalFunctions)
        };
    }

    private static SummarySection MapDuplicates(AnalysisSummaryArea area)
    {
        var rate = area.Metrics.FirstOrDefault(metric => metric.Label == "중복률(%)");
        var duplicateLines = area.Metrics.FirstOrDefault(metric => metric.Label == "중복 줄")?.Value ?? 0;
        var uniqueLines = area.Metrics.FirstOrDefault(metric => metric.Label == "고유 줄")?.Value ?? 0;
        var totalLines = Math.Max(1, duplicateLines + uniqueLines);
        var groups = area.Metrics.Skip(4).Take(4).ToList();

        var items = new List<SummaryMiniPieItem>();
        if (rate is not null)
        {
            items.Add(new SummaryMiniPieItem("중복률", rate.Value, 100, Orange));
            items.Add(new SummaryMiniPieItem("고유 비율", Math.Max(0, 100 - rate.Value), 100, Success));
        }

        items.Add(new SummaryMiniPieItem("중복 줄", duplicateLines, totalLines, Orange));
        items.Add(new SummaryMiniPieItem("고유 줄", uniqueLines, totalLines, Success));
        items.AddRange(ToCompositionPies(groups));

        return new SummarySection
        {
            Title = area.Title,
            SummaryText = area.SummaryText,
            ChartKind = SummaryChartKind.PieGrid,
            Kpis = rate is null ? [] : [new SummaryKpiItem("중복률", $"{rate.Value:F1}%")],
            PieItems = items
        };
    }

    private static SummarySection MapStructure(AnalysisSummaryArea area)
    {
        var total = Math.Max(1, SumPositive(area.Metrics));
        return MapRatioPieGrid(area, area.Metrics, total);
    }

    private static SummarySection MapCoupling(AnalysisSummaryArea area)
    {
        var headline = area.Metrics.Take(3).ToList();
        var files = area.Metrics.Skip(3).Take(4).ToList();
        var totalHeadline = Math.Max(1, SumPositive(headline));
        var totalCoupling = Math.Max(1, SumPositive(files));
        var items = new List<SummaryMiniPieItem>();
        items.AddRange(ToRatioPies(headline, totalHeadline));
        items.AddRange(ToRatioPies(files, totalCoupling));

        return new SummarySection
        {
            Title = area.Title,
            SummaryText = area.SummaryText,
            ChartKind = SummaryChartKind.PieGrid,
            PieItems = items
        };
    }

    private static SummarySection MapGlobals(AnalysisSummaryArea area)
    {
        var writable = area.Metrics.FirstOrDefault(metric => metric.Label == "쓰기 가능")?.Value ?? 0;
        var readOnly = area.Metrics.FirstOrDefault(metric => metric.Label == "읽기 전용")?.Value ?? 0;
        var totalVariables = Math.Max(1, writable + readOnly);
        var writeAccess = area.Metrics.FirstOrDefault(metric => metric.Label == "쓰기 접근")?.Value ?? 0;
        var readAccess = area.Metrics.FirstOrDefault(metric => metric.Label == "읽기 접근")?.Value ?? 0;
        var totalAccesses = Math.Max(1, writeAccess + readAccess);

        var items = new List<SummaryMiniPieItem>
        {
            new("쓰기 가능", writable, totalVariables, Critical),
            new("읽기 전용", readOnly, totalVariables, Success),
            new("다중 접근",
                area.Metrics.FirstOrDefault(metric => metric.Label == "다중 접근")?.Value ?? 0,
                totalVariables,
                Orange),
            new("쓰기 접근", writeAccess, totalAccesses, Critical),
            new("읽기 접근", readAccess, totalAccesses, Accent)
        };

        return new SummarySection
        {
            Title = area.Title,
            SummaryText = area.SummaryText,
            ChartKind = SummaryChartKind.PieGrid,
            PieItems = items
        };
    }

    private static SummarySection MapDatabase(AnalysisSummaryArea area)
    {
        var referenced = area.Metrics.FirstOrDefault(metric => metric.Label == "참조 테이블")?.Value ?? 0;
        var orphan = area.Metrics.FirstOrDefault(metric => metric.Label == "미참조 테이블")?.Value ?? 0;
        var totalTables = Math.Max(1, referenced + orphan);
        var topTables = area.Metrics.Skip(2).Take(4).ToList();
        var totalAccesses = Math.Max(1, SumPositive(topTables));

        var items = new List<SummaryMiniPieItem>
        {
            new("미참조", orphan, totalTables, Critical),
            new("참조", referenced, totalTables, Success)
        };
        items.AddRange(ToRatioPies(topTables, totalAccesses));

        return new SummarySection
        {
            Title = area.Title,
            SummaryText = area.SummaryText,
            ChartKind = SummaryChartKind.PieGrid,
            PieItems = items
        };
    }

    private static SummarySection MapBugRisk(AnalysisSummaryArea area)
    {
        var severities = area.Metrics.Take(3).ToList();
        var categories = area.Metrics.Skip(4).Take(4).ToList();
        var totalFindings = Math.Max(1, SumPositive(severities));
        var totalCategories = Math.Max(1, SumPositive(categories));
        var items = new List<SummaryMiniPieItem>();
        items.AddRange(ToRatioPies(severities, totalFindings));
        items.AddRange(ToRatioPies(categories, totalCategories));

        return new SummarySection
        {
            Title = area.Title,
            SummaryText = area.SummaryText,
            ChartKind = SummaryChartKind.PieGrid,
            PieItems = items
        };
    }

    private static SummarySection MapIssues(AnalysisSummaryArea area) =>
        new()
        {
            Title = area.Title,
            SummaryText = area.SummaryText,
            ChartKind = SummaryChartKind.None
        };

    private static SummarySection MapRatioPieGrid(
        AnalysisSummaryArea area,
        IEnumerable<AnalysisSummaryMetricRow> metrics,
        double total) =>
        new()
        {
            Title = area.Title,
            SummaryText = area.SummaryText,
            ChartKind = SummaryChartKind.PieGrid,
            PieItems = ToRatioPies(metrics, total)
        };

    private static IReadOnlyList<SummaryMiniPieItem> ToRatioPies(
        IEnumerable<AnalysisSummaryMetricRow> metrics,
        double total) =>
        metrics
            .Select(metric => new SummaryMiniPieItem(
                metric.Label,
                metric.Value,
                ResolveTotal(metric, total),
                SliceColor(metric.Label)))
            .ToList();

    private static IReadOnlyList<SummaryMiniPieItem> ToCompositionPies(IEnumerable<AnalysisSummaryMetricRow> metrics)
    {
        var items = metrics.Where(metric => metric.Value > 0).ToList();
        var total = Math.Max(1, SumPositive(items));
        return items
            .Select(metric => new SummaryMiniPieItem(metric.Label, metric.Value, total, SliceColor(metric.Label)))
            .ToList();
    }

    private static double ResolveTotal(AnalysisSummaryMetricRow metric, double total)
    {
        if (metric.Label.Contains("중복률", StringComparison.Ordinal))
        {
            return 100;
        }

        return Math.Max(1, total);
    }

    private static double SumFunctionStatus(IEnumerable<AnalysisSummaryMetricRow> metrics) =>
        Math.Max(
            1,
            metrics.Where(metric => metric.Label is "정상 함수" or "경고 함수" or "심각 함수")
                .Sum(metric => metric.Value));

    private static double SumPositive(IEnumerable<AnalysisSummaryMetricRow> metrics) =>
        metrics.Where(metric => metric.Value > 0).Sum(metric => metric.Value);

    private static Color SliceColor(string label)
    {
        if (label is "정상 함수" or "Fan-out 1-2" or "읽기 전용" or "참조" or "참조 테이블" or "고유 줄" or "고유 비율" or "Info")
        {
            return Success;
        }

        if (label is "경고 함수" or "Fan-out 3-5" or "Fan-out 6-10" or "Warning")
        {
            return Warning;
        }

        if (label.Contains("중복", StringComparison.Ordinal) && !label.Contains("고유", StringComparison.Ordinal))
        {
            return Orange;
        }

        if (label is "Critical" or "Critical 버그" or "심각 함수" or "Fan-out 11+" or "미참조" or "미참조 테이블" or "쓰기 가능")
        {
            return Critical;
        }

        return PaletteColor(label);
    }

    private static Color PaletteColor(string label)
    {
        var hash = Math.Abs(label.GetHashCode(StringComparison.Ordinal));
        Color[] palette = [Critical, Orange, Warning, Purple, Accent, Primary];
        return palette[hash % palette.Length];
    }

    private static Color ScoreColor(float score) =>
        score >= 75f ? Success : score >= 50f ? Warning : Critical;

    private static string FormatValue(double value) =>
        value >= 1000 ? value.ToString("N0") : value.ToString("0.#");

    private static string FormatScore(double value) => $"{value:0.#}";
}
