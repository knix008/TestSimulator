using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using MeetingMinute.App.Models;

namespace MeetingMinute.App.Services;

public static class WordMeetingSerializer
{
    public static void SaveAsDocx(string path, MeetingMinuteDocument doc)
    {
        using var wordDoc = WordprocessingDocument.Create(path, WordprocessingDocumentType.Document);
        var mainPart = wordDoc.AddMainDocumentPart();
        mainPart.Document = new Document();
        var body = new Body();
        mainPart.Document.Append(body);

        var title = string.IsNullOrWhiteSpace(doc.Title) ? "제목 없음" : doc.Title.Trim();
        body.Append(CreateMainTitle("회의록"));
        body.Append(CreateBlankParagraph());

        body.Append(CreateHeading2("1. 시간/장소"));
        var (datePart, timePart) = SplitDateAndTime(doc.DateTimeText);
        body.Append(CreateBodyParagraph($"회의 제목: {title}"));
        body.Append(CreateBodyParagraph($"날짜: {datePart}"));
        body.Append(CreateBodyParagraph($"시간: {timePart}"));
        body.Append(CreateBodyParagraph($"장소: {doc.Location}"));
        body.Append(CreateBodyParagraph($"작성자/참석자: {BuildAuthorAttendeesLine(doc.Author, doc.Attendees)}"));
        body.Append(CreateBlankParagraph());

        AppendSection(body, "2. 안건 및 논의", doc.AgendaAndDiscussion);
        AppendSection(body, "3. 결정 사항", doc.Decisions);
        AppendSection(body, "4. 액션 아이템", doc.ActionItems);
        AppendSection(body, "5. 차기 회의", doc.NextMeeting);
        AppendSection(body, "6. 기타 메모", doc.Notes);

        mainPart.Document.Save();
    }

    private static void AppendSection(Body body, string header, string? content)
    {
        body.Append(CreateHeading2(header));
        var lines = (content ?? "").Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');
        if (lines.All(string.IsNullOrWhiteSpace))
        {
            body.Append(CreateBodyParagraph(""));
        }
        else
        {
            foreach (var line in lines)
            {
                body.Append(CreateBodyParagraph(line));
            }
        }

        body.Append(CreateBlankParagraph());
    }

    private static Paragraph CreateHeading1(string text)
    {
        return CreateParagraph(text, "Heading1");
    }

    private static Paragraph CreateMainTitle(string text)
    {
        var paragraph = new Paragraph(
            new ParagraphProperties(
                new Justification { Val = JustificationValues.Center }));

        var run = new Run(
            new RunProperties(
                new Bold(),
                new FontSize { Val = "64" }), // 32pt
            new Text(text ?? "") { Space = SpaceProcessingModeValues.Preserve });

        paragraph.Append(run);
        return paragraph;
    }

    private static Paragraph CreateHeading2(string text)
    {
        var paragraph = new Paragraph();
        var run = new Run(
            new RunProperties(
                new Bold(),
                new FontSize { Val = "40" }), // 20pt
            new Text(text ?? "") { Space = SpaceProcessingModeValues.Preserve });
        paragraph.Append(run);
        return paragraph;
    }

    private static Paragraph CreateBodyParagraph(string text)
    {
        return CreateParagraph(text, null);
    }

    private static Paragraph CreateBlankParagraph()
    {
        return CreateParagraph("", null);
    }

    private static Paragraph CreateParagraph(string text, string? paragraphStyleId)
    {
        var paragraph = new Paragraph();
        if (!string.IsNullOrWhiteSpace(paragraphStyleId))
        {
            paragraph.ParagraphProperties = new ParagraphProperties(
                new ParagraphStyleId { Val = paragraphStyleId });
        }

        paragraph.Append(new Run(new Text(text ?? "") { Space = SpaceProcessingModeValues.Preserve }));
        return paragraph;
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

    private static string BuildAuthorAttendeesLine(string? author, string? attendees)
    {
        var a = (author ?? "").Trim();
        var b = (attendees ?? "").Replace("\r\n", ", ", StringComparison.Ordinal).Replace('\n', ',').Trim(' ', ',');
        if (string.IsNullOrWhiteSpace(a))
            return b;
        if (string.IsNullOrWhiteSpace(b))
            return a;
        return $"{a} / {b}";
    }
}
