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

        var parts = new List<string>
        {
            report.Message,
            $"{report.Percent}%"
        };

        if (report.Elapsed.TotalSeconds >= 1)
        {
            parts.Add($"경과 {FormatDuration(report.Elapsed)}");
        }

        if (report.EstimatedRemaining is { } remaining)
        {
            parts.Add($"남은 시간 {FormatRemaining(remaining)}");
        }
        else if (report.Elapsed.TotalSeconds >= 3)
        {
            parts.Add("남은 시간 계산 중");
        }

        return string.Join(" · ", parts);
    }

    public static string FormatRemaining(TimeSpan remaining)
    {
        return FormatApproxDuration(remaining);
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

    private static string FormatApproxDuration(TimeSpan remaining)
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
