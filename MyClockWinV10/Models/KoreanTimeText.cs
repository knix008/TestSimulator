namespace MyClockWinV10.Models;

/// <summary>Formats clock time as Korean text, e.g. 열두시:삼십분:오십구초.</summary>
public static class KoreanTimeText
{
    private static readonly string[] SinoOnes =
        ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];

    private static readonly string[] NativeHours =
        ["", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉", "열", "열한", "열두"];

    public static string FormatClock(DateTime now, bool use24h, bool showSeconds)
    {
        int hour12 = now.Hour % 12;
        if (hour12 == 0) hour12 = 12;

        int h = use24h ? now.Hour : hour12;
        string hourPart = use24h ? $"{ToSino(h)}시" : $"{NativeHours[h]}시";
        string minPart  = $"{ToSino(now.Minute)}분";

        if (!showSeconds)
            return $"{hourPart}:{minPart}";

        return $"{hourPart}:{minPart}:{ToSino(now.Second)}초";
    }

    public static string FormatCountdown(TimeSpan remaining, bool showSeconds)
    {
        int h = (int)remaining.TotalHours;
        string hourPart = h > 0 ? $"{ToSino(h)}시간" : "";
        string minPart  = $"{ToSino(remaining.Minutes)}분";

        if (!showSeconds)
            return string.IsNullOrEmpty(hourPart)
                ? minPart
                : $"{hourPart}:{minPart}";

        string secPart = $"{ToSino(remaining.Seconds)}초";
        if (string.IsNullOrEmpty(hourPart))
            return $"{minPart}:{secPart}";
        return $"{hourPart}:{minPart}:{secPart}";
    }

    /// <summary>Sino-Korean numerals for 0–99 (영, 일, …, 오십구).</summary>
    public static string ToSino(int n)
    {
        if (n is < 0 or > 99)
            return n.ToString();

        if (n == 0) return "영";
        if (n < 10) return SinoOnes[n];
        if (n < 20) return n == 10 ? "십" : "십" + SinoOnes[n % 10];

        int tens = n / 10;
        int ones = n % 10;
        string tensStr = tens switch
        {
            2 => "이십",
            3 => "삼십",
            4 => "사십",
            5 => "오십",
            6 => "육십",
            7 => "칠십",
            8 => "팔십",
            9 => "구십",
            _ => SinoOnes[tens] + "십"
        };
        return ones == 0 ? tensStr : tensStr + SinoOnes[ones];
    }
}
