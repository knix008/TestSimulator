using System;

namespace MyClockWinV10.Models;

public class CalendarEventItem
{
    public string   Title    { get; init; } = "";
    public DateTime Start    { get; init; }
    public DateTime End      { get; init; }
    public string   Location { get; init; } = "";
    public bool     IsAllDay { get; init; }

    public string DateLabel =>
        Start.ToString("M월 d일 ") + Start.ToString("ddd", new System.Globalization.CultureInfo("ko-KR"));

    public string TimeLabel =>
        IsAllDay ? "종일" : $"{Start:HH:mm} ~ {End:HH:mm}";

    public bool HasLocation => !string.IsNullOrWhiteSpace(Location);
}
