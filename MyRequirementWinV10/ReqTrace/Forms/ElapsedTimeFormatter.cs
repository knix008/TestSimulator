namespace ReqTrace.Forms;

internal static class ElapsedTimeFormatter
{
    internal static string FormatDuration(TimeSpan elapsed)
    {
        if (elapsed.TotalHours >= 1)
            return $"{(int)elapsed.TotalHours}:{elapsed.Minutes:D2}:{elapsed.Seconds:D2}";

        return $"{(int)elapsed.TotalMinutes}:{elapsed.Seconds:D2}";
    }
}
