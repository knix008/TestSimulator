namespace CodeAnalyzer.Services;

public sealed class AnalysisSummaryMetricRow
{
    public required string Label { get; init; }
    public double Value { get; init; }
    public string? Detail { get; init; }
}

public sealed class AnalysisSummaryArea
{
    public required SummaryAreaKind Kind { get; init; }
    public required string Title { get; init; }
    public required string SummaryText { get; init; }
    public IReadOnlyList<AnalysisSummaryMetricRow> Metrics { get; init; } = [];
}

public sealed class AnalysisSummaryRadarAxis
{
    public required string Label { get; init; }
    public string? Detail { get; init; }
    public float Score { get; init; }
}

public sealed class AnalysisSummarySnapshot
{
    public IReadOnlyList<AnalysisSummaryRadarAxis> RadarAxes { get; init; } = [];
    public IReadOnlyList<AnalysisSummaryArea> Areas { get; init; } = [];
}
