namespace MyAgileBoardWinV10.Models;

public class BurndownChartColorSettings
{
    public string DailyBarHex { get; set; } = "#228B47";
    public string IdealLineHex { get; set; } = "#A0A0A0";
    public string RemainingLineHex { get; set; } = "#DC3C3C";

    public static BurndownChartColorSettings CreateDefault() => new();

    public BurndownChartColorSettings Clone() => new()
    {
        DailyBarHex = DailyBarHex,
        IdealLineHex = IdealLineHex,
        RemainingLineHex = RemainingLineHex
    };
}
