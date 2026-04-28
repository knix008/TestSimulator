namespace MeetingMinute.App.Models;

/// <summary>
/// In-memory representation of a meeting minute before Markdown serialization.
/// </summary>
public sealed class MeetingMinuteDocument
{
    public string Title { get; set; } = "";
    public string DateTimeText { get; set; } = "";
    public string Location { get; set; } = "";
    public string Author { get; set; } = "";
    public string Attendees { get; set; } = "";
    public string AgendaAndDiscussion { get; set; } = "";
    public string Decisions { get; set; } = "";
    public string ActionItems { get; set; } = "";
    public string NextMeeting { get; set; } = "";
    public string Notes { get; set; } = "";
}
