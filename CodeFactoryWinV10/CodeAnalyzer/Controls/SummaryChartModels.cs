namespace CodeAnalyzer.Controls;

internal enum SummaryChartKind
{
    None,
    KpiRow,
    VerticalBar,
    HorizontalBar,
    Pie,
    Donut,
    PieGrid,
    Radar
}

internal readonly record struct SummaryRadarAxisItem(string Label, float Score, string? Detail = null);

internal readonly record struct SummaryChartSlice(string Label, double Value, Color Color);

internal readonly record struct SummaryBarItem(string Label, double Value, Color Color);

internal readonly record struct SummaryMiniPieItem(string Label, double Value, double Total, Color Color);

internal readonly record struct SummaryKpiItem(string Label, string Value, string? Hint = null);

internal sealed class SummarySection
{
    public required string Title { get; init; }
    public required string SummaryText { get; init; }
    public SummaryChartKind ChartKind { get; init; } = SummaryChartKind.None;
    public bool IsFullWidth { get; init; }
    public int? CardHeight { get; init; }
    public IReadOnlyList<SummaryKpiItem> Kpis { get; init; } = [];
    public IReadOnlyList<SummaryChartSlice> Slices { get; init; } = [];
    public IReadOnlyList<SummaryBarItem> Bars { get; init; } = [];
    public IReadOnlyList<SummaryMiniPieItem> PieItems { get; init; } = [];
    public IReadOnlyList<SummaryRadarAxisItem> RadarAxes { get; init; } = [];
}
