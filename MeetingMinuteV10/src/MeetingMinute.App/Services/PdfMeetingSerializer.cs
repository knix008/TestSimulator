using System.Globalization;
using System.IO;
using System.Text.RegularExpressions;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using MeetingMinute.App.Models;

namespace MeetingMinute.App.Services;

public static class PdfMeetingSerializer
{
    private static readonly Regex ImgTagRegex = new(
        @"<img\s[^>]*src=""([^""]+)""[^>]*?>",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    static PdfMeetingSerializer()
    {
        // QuestPDF 2024.x: Settings가 QuestPDF 루트 네임스페이스로 이동됨
        QuestPDF.Settings.License = LicenseType.Community;
    }

    public static void SaveAsPdf(string path, MeetingMinuteDocument doc, DocumentFormatSettings? format = null)
    {
        var fmt = format ?? new DocumentFormatSettings();

        Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin((float)fmt.PageMarginMm, Unit.Millimetre);
                page.DefaultTextStyle(s => s
                    .FontFamily(fmt.FontFamily)
                    .FontSize((float)fmt.BodyFontSizePt)
                    .LineHeight((float)fmt.LineSpacing));

                page.Content().Column(col =>
                {
                    col.Spacing(6);

                    // 메인 제목
                    col.Item().AlignCenter().Text("회의록")
                        .Bold()
                        .FontSize((float)Math.Max(24.0, fmt.BodyFontSizePt * 2.5));

                    // 작성자
                    if (!string.IsNullOrWhiteSpace(doc.Author))
                        col.Item().AlignRight().Text($"작성자 : {doc.Author.Trim()}");

                    col.Item().PaddingTop(4).LineHorizontal(0.5f).LineColor(Colors.Grey.Lighten2);

                    // 1. 회의 제목
                    AddSection(col, "1. 회의 제목",
                        string.IsNullOrWhiteSpace(doc.Title) ? "제목 없음" : doc.Title.Trim(), fmt);

                    // 2. 시간/장소
                    var (datePart, timePart) = SplitDateAndTime(doc.DateTimeText);
                    col.Item().Text(t =>
                        t.Span("2. 시간/장소").Bold().FontSize((float)(fmt.BodyFontSizePt + 3)));
                    col.Item().Text($"날짜: {datePart}");
                    col.Item().Text($"시간: {timePart}");
                    col.Item().Text($"장소: {doc.Location}");
                    col.Item().Text($"참석자: {FormatAttendees(doc.Attendees)}");

                    // 3. 안건 및 논의
                    col.Item().Text(t =>
                        t.Span("3. 안건 및 논의").Bold().FontSize((float)(fmt.BodyFontSizePt + 3)));
                    AddAgendaContent(col, doc.AgendaAndDiscussion, fmt);

                    AddSection(col, "4. 결정 사항", doc.Decisions, fmt);
                    AddSection(col, "5. 액션 아이템", doc.ActionItems, fmt);
                    AddSection(col, "6. 차기 회의", doc.NextMeeting, fmt);
                    AddSection(col, "7. 기타 메모", doc.Notes, fmt);
                });

                page.Footer().AlignCenter()
                    .Text(t =>
                    {
                        t.CurrentPageNumber();
                        t.Span(" / ");
                        t.TotalPages();
                    });
            });
        }).GeneratePdf(path);
    }

    private static void AddSection(
        ColumnDescriptor col, string header, string? content, DocumentFormatSettings fmt)
    {
        col.Item().Text(t =>
            t.Span(header).Bold().FontSize((float)(fmt.BodyFontSizePt + 3)));

        var lines = (content ?? "").Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');
        foreach (var line in lines)
        {
            var cleanLine = ImgTagRegex.Replace(line, "").Trim();
            col.Item().Text(cleanLine);
        }
    }

    private static void AddAgendaContent(
        ColumnDescriptor col, string? content, DocumentFormatSettings fmt)
    {
        var lines = (content ?? "").Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');
        foreach (var line in lines)
        {
            var pos = 0;
            var hasImage = false;
            foreach (Match match in ImgTagRegex.Matches(line))
            {
                hasImage = true;
                if (match.Index > pos)
                {
                    var text = line[pos..match.Index].Trim();
                    if (!string.IsNullOrWhiteSpace(text))
                        col.Item().Text(text);
                }

                var imgPath = match.Groups[1].Value.Replace("/", "\\", StringComparison.Ordinal);
                var widthPx = ParseAttr(match.Value, "width", 480);
                if (File.Exists(imgPath))
                {
                    // 페이지 너비(A4 = 595pt, 여백 제외) 내에서 맞춤
                    var maxWidthPt = (float)Math.Min(widthPx * 0.75, 420);
                    col.Item().MaxWidth(maxWidthPt).Image(imgPath).FitWidth();
                }

                pos = match.Index + match.Length;
            }

            if (!hasImage)
                col.Item().Text(line);
            else if (pos < line.Length)
            {
                var tail = line[pos..].Trim();
                if (!string.IsNullOrWhiteSpace(tail))
                    col.Item().Text(tail);
            }
        }
    }

    private static string FormatAttendees(string? attendees) =>
        (attendees ?? "").Replace("\r\n", ", ", StringComparison.Ordinal)
                         .Replace('\n', ',')
                         .Trim(' ', ',');

    private static double ParseAttr(string tag, string name, double fallback)
    {
        var m = Regex.Match(tag, $@"{name}=""([0-9]+(?:\.[0-9]+)?)""", RegexOptions.IgnoreCase);
        if (m.Success && double.TryParse(m.Groups[1].Value, NumberStyles.Float,
                CultureInfo.InvariantCulture, out var val))
            return val;
        return fallback;
    }

    private static (string DatePart, string TimePart) SplitDateAndTime(string? dt)
    {
        var raw = dt?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(raw)) return ("", "");
        var parts = raw.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
        return parts.Length == 2 ? (parts[0], parts[1]) : (raw, "");
    }
}
