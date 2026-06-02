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

        var percentText = $"{report.Percent}%";

        if (report.EstimatedRemaining is null)
        {
            return $"{report.Message}  ({percentText})";
        }

        return $"{report.Message}  ({percentText}, 남은 시간 {FormatRemaining(report.EstimatedRemaining.Value)})";
    }

    public static string FormatRemaining(TimeSpan remaining)
    {
        var totalSeconds = Math.Max(0, (int)Math.Round(remaining.TotalSeconds));

        if (totalSeconds < 5)
        {
            return "곧 완료";
        }

        if (totalSeconds < 60)
        {
            return $"약 {totalSeconds}초";
        }

        if (totalSeconds < 3600)
        {
            var minutes = Math.Max(1, (int)Math.Round(totalSeconds / 60.0));
            return $"약 {minutes}분";
        }

        var hours = totalSeconds / 3600;
        var minutesPart = (totalSeconds % 3600) / 60;
        return minutesPart > 0 ? $"약 {hours}시간 {minutesPart}분" : $"약 {hours}시간";
    }
}
