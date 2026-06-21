namespace MyGitWinV10.App.Services;

public sealed class SummaryChartData
{
    public IReadOnlyList<ChartSeriesPoint> CommitsByMonth { get; init; } = [];

    public IReadOnlyList<ChartSeriesPoint> CommitsByAuthor { get; init; } = [];

    public IReadOnlyList<ChartSeriesPoint> RepositoryComposition { get; init; } = [];

    public IReadOnlyList<CommitRow> CommitGraphRows { get; init; } = [];
}

public sealed class ChartSeriesPoint
{
    public required string Label { get; init; }

    public double Value { get; init; }
}

public sealed class RepositoryChartImage
{
    public required string Title { get; init; }

    public required string FileName { get; init; }

    public required byte[] PngData { get; init; }
}
