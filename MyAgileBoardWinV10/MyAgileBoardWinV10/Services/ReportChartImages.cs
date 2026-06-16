namespace MyAgileBoardWinV10.Services;

public sealed class ReportChartImages
{
    public byte[] ColumnPieChartPng { get; init; } = [];
    public byte[] PriorityBarChartPng { get; init; } = [];
    public byte[] BurndownChartPng { get; init; } = [];
    public string BurndownCaption { get; init; } = string.Empty;

    public bool HasCharts =>
        ColumnPieChartPng.Length > 0
        || PriorityBarChartPng.Length > 0
        || BurndownChartPng.Length > 0;
}
