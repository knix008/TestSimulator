using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public static class AnalysisProgressFormatter
{
    public static string FormatStatus(AnalysisProgressReport report)
    {
        if (report.Percent >= 100)
        {
            return report.Message;
        }

        return string.Join(" · ", new[]
        {
            report.Message,
            $"{report.Percent}%",
            $"경과 {FormatDuration(report.Elapsed)}"
        });
    }

    public static string FormatDuration(TimeSpan elapsed)
    {
        var totalSeconds = Math.Max(0, (int)Math.Round(elapsed.TotalSeconds));

        if (totalSeconds < 60)
        {
            return $"{totalSeconds}초";
        }

        if (totalSeconds < 3600)
        {
            var minutes = totalSeconds / 60;
            var seconds = totalSeconds % 60;
            return seconds > 0 ? $"{minutes}분 {seconds}초" : $"{minutes}분";
        }

        var hours = totalSeconds / 3600;
        var minutesPart = (totalSeconds % 3600) / 60;
        return minutesPart > 0 ? $"{hours}시간 {minutesPart}분" : $"{hours}시간";
    }
}
