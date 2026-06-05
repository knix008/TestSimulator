using System;

namespace MyClockWinV10.Models;

public enum RecurrenceType { None, Daily, Weekly, Monthly, Yearly }

public class CalendarEvent
{
    public Guid           Id              { get; set; } = Guid.NewGuid();
    public string         Title           { get; set; } = "";
    public DateTime       Date            { get; set; }
    public TimeSpan       StartTime       { get; set; } = TimeSpan.FromHours(9);
    public TimeSpan       EndTime         { get; set; } = TimeSpan.FromHours(10);
    public bool           IsAllDay        { get; set; } = false;
    public string         Description     { get; set; } = "";
    public int?           ReminderMinutes { get; set; }
    public RecurrenceType Recurrence      { get; set; } = RecurrenceType.None;
    public DateTime?      EndDate         { get; set; } = null;
    public string         Color           { get; set; } = "#4A90D9";

    public bool IsMultiDay => EndDate.HasValue && EndDate.Value.Date > Date.Date;
}
