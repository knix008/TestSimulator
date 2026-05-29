using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using MeetingMinute.App.Models;

namespace MeetingMinute.App.Services;

public static class MarkdownMeetingSerializer
{
    private static readonly Regex FormatCommentRegex = new(
        @"^<!--\s*meeting-format:\s*font=""([^""]*)""\s+size=([\d.]+)\s+spacing=([\d.]+)\s+margin=([\d.]+)\s*-->\r?\n?",
        RegexOptions.Compiled);

    public static string BuildFormatComment(DocumentFormatSettings fmt)
        => string.Format(CultureInfo.InvariantCulture,
            "<!-- meeting-format: font=\"{0}\" size={1} spacing={2} margin={3} -->",
            fmt.FontFamily, fmt.BodyFontSizePt, fmt.LineSpacing, fmt.PageMarginMm);

    public static string StripFormatComment(string markdown)
        => FormatCommentRegex.Replace(markdown, "");

    public static DocumentFormatSettings? ExtractFormat(string markdown)
    {
        var m = FormatCommentRegex.Match(markdown);
        if (!m.Success) return null;
        var fmt = new DocumentFormatSettings();
        fmt.FontFamily = m.Groups[1].Value;
        if (double.TryParse(m.Groups[2].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var size))
            fmt.BodyFontSizePt = size;
        if (double.TryParse(m.Groups[3].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var spacing))
            fmt.LineSpacing = spacing;
        if (double.TryParse(m.Groups[4].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var margin))
            fmt.PageMarginMm = margin;
        return fmt;
    }
    private const string TitleHeader = "## 1. 회의 제목";
    private const string TimePlaceHeader = "## 2. 시간/장소";
    private const string AgendaHeader = "## 3. 안건 및 논의";
    private const string DecisionsHeader = "## 4. 결정 사항";
    private const string ActionsHeader = "## 5. 액션 아이템";
    private const string NextHeader = "## 6. 차기 회의";
    private const string NotesHeader = "## 7. 기타 메모";

    public static string ToMarkdown(MeetingMinuteDocument doc)
    {
        var sb = new StringBuilder();
        var title = string.IsNullOrWhiteSpace(doc.Title) ? "제목 없음" : doc.Title.Trim();
        sb.AppendLine("# 회의록");
        sb.AppendLine();
        sb.AppendLine(TitleHeader);
        sb.AppendLine();
        sb.AppendLine(EscapeInline(title));
        sb.AppendLine();
        sb.AppendLine(TimePlaceHeader);
        var (dateText, timeText) = SplitDateAndTime(doc.DateTimeText);
        if (!string.IsNullOrWhiteSpace(doc.Author))
            sb.AppendLine(CultureInfo.InvariantCulture, $"- **작성자**: {EscapeInline(doc.Author.Trim())}");
        sb.AppendLine(CultureInfo.InvariantCulture, $"- **날짜**: {EscapeInline(dateText)}");
        sb.AppendLine(CultureInfo.InvariantCulture, $"- **시간**: {EscapeInline(timeText)}");
        sb.AppendLine(CultureInfo.InvariantCulture, $"- **장소**: {EscapeInline(doc.Location)}");
        sb.AppendLine(CultureInfo.InvariantCulture, $"- **참석자**: {EscapeInline((doc.Attendees ?? "").Replace("\r\n", ", ", StringComparison.Ordinal).Replace('\n', ',').Trim(' ', ','))}");
        sb.AppendLine();
        sb.AppendLine(AgendaHeader);
        sb.AppendLine();
        sb.AppendLine(TrimOrEmptyNote(doc.AgendaAndDiscussion));
        sb.AppendLine();
        sb.AppendLine(DecisionsHeader);
        sb.AppendLine();
        sb.AppendLine(TrimOrEmptyNote(doc.Decisions));
        sb.AppendLine();
        sb.AppendLine(ActionsHeader);
        sb.AppendLine();
        sb.AppendLine(TrimOrEmptyNote(doc.ActionItems));
        sb.AppendLine();
        sb.AppendLine(NextHeader);
        sb.AppendLine();
        sb.AppendLine(TrimOrEmptyNote(doc.NextMeeting));
        sb.AppendLine();
        sb.AppendLine(NotesHeader);
        sb.AppendLine();
        sb.AppendLine(TrimOrEmptyNote(doc.Notes));
        sb.AppendLine();
        return sb.ToString();
    }

    public static MeetingMinuteDocument FromMarkdown(string markdown)
    {
        var doc = new MeetingMinuteDocument();
        if (string.IsNullOrWhiteSpace(markdown))
            return doc;

        var lines = markdown.Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n')
            .Split('\n', StringSplitOptions.None);

        var titleMatch = Regex.Match(markdown, @"^#\s*회의록\s*[—\-–]\s*(.+)$", RegexOptions.Multiline);
        if (titleMatch.Success)
            doc.Title = titleMatch.Groups[1].Value.Trim();

        static string SectionAfter(string[] allLines, params string[] headers)
        {
            var start = -1;
            for (var i = 0; i < allLines.Length; i++)
            {
                var line = allLines[i].Trim();
                if (headers.Any(h => string.Equals(line, h, StringComparison.Ordinal)))
                {
                    start = i + 1;
                    break;
                }
            }

            if (start < 0)
                return "";

            var sb = new StringBuilder();
            for (var j = start; j < allLines.Length; j++)
            {
                var line = allLines[j];
                if (line.StartsWith("## ", StringComparison.Ordinal))
                    break;
                sb.AppendLine(line);
            }

            return sb.ToString().TrimEnd();
        }

        var titleBlock = SectionAfter(lines, TitleHeader);
        if (!string.IsNullOrWhiteSpace(titleBlock))
            doc.Title = titleBlock.Trim();

        var timePlaceBlock = SectionAfter(lines, TimePlaceHeader, "## 1. 시간/장소", "## 1. 메타", "## 메타");
        var titleInMeta = ExtractMetaLine(timePlaceBlock, "회의 제목");
        if (string.IsNullOrWhiteSpace(doc.Title))
            doc.Title = titleInMeta;
        var datePart = ExtractMetaLine(timePlaceBlock, "날짜");
        var timePart = ExtractMetaLine(timePlaceBlock, "시간");
        if (!string.IsNullOrWhiteSpace(datePart) || !string.IsNullOrWhiteSpace(timePart))
            doc.DateTimeText = string.IsNullOrWhiteSpace(timePart) ? datePart : $"{datePart} {timePart}".Trim();
        else
            doc.DateTimeText = ExtractMetaLine(timePlaceBlock, "일시");
        doc.Author = ExtractMetaLine(timePlaceBlock, "작성자");
        doc.Location = ExtractMetaLine(timePlaceBlock, "장소");
        doc.Attendees = ExtractMetaLine(timePlaceBlock, "참석자");
        // 구버전 호환: 작성자/참석자 키에서 분리
        var authorAttendees = ExtractMetaLine(timePlaceBlock, "작성자/참석자");
        if (!string.IsNullOrWhiteSpace(authorAttendees))
        {
            var split = authorAttendees.Split('/', 2, StringSplitOptions.TrimEntries);
            if (split.Length == 2)
            {
                doc.Author = split[0];
                if (string.IsNullOrWhiteSpace(doc.Attendees))
                    doc.Attendees = split[1];
            }
            else if (string.IsNullOrWhiteSpace(doc.Author))
            {
                doc.Author = authorAttendees;
            }
        }

        if (string.IsNullOrWhiteSpace(doc.Attendees))
            doc.Attendees = SectionAfter(lines, "## 2. 참석자", "## 참석자");
        doc.AgendaAndDiscussion = SectionAfter(lines, AgendaHeader, "## 2. 안건 및 논의", "## 안건 및 논의");
        doc.Decisions = SectionAfter(lines, DecisionsHeader, "## 3. 결정 사항", "## 결정 사항");
        doc.ActionItems = SectionAfter(lines, ActionsHeader, "## 4. 액션 아이템", "## 액션 아이템");
        doc.NextMeeting = SectionAfter(lines, NextHeader, "## 5. 차기 회의", "## 차기 회의");
        doc.Notes = SectionAfter(lines, NotesHeader, "## 6. 기타 메모", "## 기타 메모");

        return doc;
    }

    private static string ExtractMetaLine(string block, string key)
    {
        foreach (var raw in block.Split('\n', StringSplitOptions.RemoveEmptyEntries))
        {
            var line = raw.Trim();
            var pattern = $@"^\-\s*\*\*{Regex.Escape(key)}\*\*:\s*(.*)$";
            var m = Regex.Match(line, pattern);
            if (m.Success)
                return m.Groups[1].Value.Trim();
        }

        return "";
    }

    private static string EscapeInline(string? s)
    {
        if (string.IsNullOrEmpty(s))
            return "";
        return s.Replace("\r\n", " ", StringComparison.Ordinal).Replace('\n', ' ');
    }

    private static string TrimOrEmptyNote(string? s)
    {
        var t = s?.Trim();
        return t ?? "";
    }

    private static (string DatePart, string TimePart) SplitDateAndTime(string? dateTimeText)
    {
        var raw = dateTimeText?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(raw))
            return ("", "");

        var parts = raw.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 2)
            return (parts[0], parts[1]);
        return (raw, "");
    }

}
