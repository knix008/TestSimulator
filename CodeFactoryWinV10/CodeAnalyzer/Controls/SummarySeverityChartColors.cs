using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

/// <summary>Summary 분석 항목 파이 차트 — 심각도별 통일 색상.</summary>
internal static class SummarySeverityChartColors
{
    public static readonly Color Critical = Color.FromArgb(231, 76, 60);
    public static readonly Color Warning = Color.FromArgb(241, 196, 15);
    public static readonly Color Info = Color.FromArgb(52, 152, 219);
    public static readonly Color Neutral = Color.FromArgb(210, 215, 222);

    public static Color ForSeverity(InspectionPieSeverity severity) => severity switch
    {
        InspectionPieSeverity.Critical => Critical,
        InspectionPieSeverity.Warning => Warning,
        InspectionPieSeverity.Info => Info,
        _ => Neutral
    };
}
