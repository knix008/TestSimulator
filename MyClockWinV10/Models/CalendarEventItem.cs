namespace MyClockWinV10.Models;

public class CalendarEventItem
{
    public string    Id              { get; set; } = "";
    public string    Title           { get; set; } = "";
    public DateTime  Start           { get; set; }
    public bool      IsAllDay        { get; set; }
    public string    Location        { get; set; } = "";
    public List<int> ReminderMinutes { get; set; } = new();

    public string DisplayStart => IsAllDay
        ? Start.ToString("M월 d일 (ddd)")
        : Start.ToString("M월 d일 (ddd) HH:mm");

    public string ReminderSummary
    {
        get
        {
            if (ReminderMinutes.Count == 0) return "알림 없음";
            return string.Join("  ", ReminderMinutes.OrderBy(m => m).Select(FormatMinutes));
        }
    }

    private static string FormatMinutes(int m) => m switch
    {
        >= 1440 => $"{m / 1440}일 전",
        >= 60   => $"{m / 60}시간 전",
        _       => $"{m}분 전"
    };
}
