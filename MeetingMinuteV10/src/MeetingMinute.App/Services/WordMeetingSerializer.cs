using System.IO;
using System.Globalization;
using System.Text.RegularExpressions;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using Drawing = DocumentFormat.OpenXml.Drawing;
using DW = DocumentFormat.OpenXml.Drawing.Wordprocessing;
using PIC = DocumentFormat.OpenXml.Drawing.Pictures;
using MeetingMinute.App.Models;

namespace MeetingMinute.App.Services;

public static class WordMeetingSerializer
{
    private static readonly Regex AgendaImageTagRegex = new(
        "<img\\s+[^>]*src=\"([^\"]+)\"[^>]*?(?:width=\"([0-9]+(?:\\.[0-9]+)?)\")?[^>]*?(?:height=\"([0-9]+(?:\\.[0-9]+)?)\")?[^>]*?>",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public static void SaveAsDocx(string path, MeetingMinuteDocument doc)
    {
        using var wordDoc = WordprocessingDocument.Create(path, WordprocessingDocumentType.Document);
        var mainPart = wordDoc.AddMainDocumentPart();
        mainPart.Document = new Document();
        var body = new Body();
        mainPart.Document.Append(body);

        var title = string.IsNullOrWhiteSpace(doc.Title) ? "제목 없음" : doc.Title.Trim();
        body.Append(CreateMainTitle("회의록"));
        if (!string.IsNullOrWhiteSpace(doc.Author))
            body.Append(CreateRightAlignedParagraph(doc.Author.Trim()));
        body.Append(CreateBlankParagraph());

        AppendSection(body, "1. 회의 제목", title);

        body.Append(CreateHeading2("2. 시간/장소"));
        var (datePart, timePart) = SplitDateAndTime(doc.DateTimeText);
        body.Append(CreateBodyParagraph($"날짜: {datePart}"));
        body.Append(CreateBodyParagraph($"시간: {timePart}"));
        body.Append(CreateBodyParagraph($"장소: {doc.Location}"));
        body.Append(CreateBodyParagraph($"참석자: {(doc.Attendees ?? "").Replace("\r\n", ", ", StringComparison.Ordinal).Replace('\n', ',').Trim(' ', ',')}"));
        body.Append(CreateBlankParagraph());

        body.Append(CreateHeading2("3. 안건 및 논의"));
        AppendAgendaWithImages(body, mainPart, doc.AgendaAndDiscussion);
        body.Append(CreateBlankParagraph());
        AppendSection(body, "4. 결정 사항", doc.Decisions);
        AppendSection(body, "5. 액션 아이템", doc.ActionItems);
        AppendSection(body, "6. 차기 회의", doc.NextMeeting);
        AppendSection(body, "7. 기타 메모", doc.Notes);

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
                body.Append(CreateBodyParagraph(line));
        }

        body.Append(CreateBlankParagraph());
    }

    private static void AppendAgendaWithImages(Body body, MainDocumentPart mainPart, string? content)
    {
        var lines = (content ?? "").Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');
        if (lines.All(string.IsNullOrWhiteSpace))
        {
            body.Append(CreateBodyParagraph(""));
            return;
        }

        foreach (var line in lines)
        {
            if (!AgendaImageTagRegex.IsMatch(line))
            {
                body.Append(CreateBodyParagraph(line));
                continue;
            }

            // 텍스트와 이미지가 섞인 줄: 순서대로 처리
            var pos = 0;
            foreach (Match match in AgendaImageTagRegex.Matches(line))
            {
                if (match.Index > pos)
                {
                    var text = line[pos..match.Index].Trim();
                    if (!string.IsNullOrWhiteSpace(text))
                        body.Append(CreateBodyParagraph(text));
                }

                var path = match.Groups[1].Value.Replace("/", "\\", StringComparison.Ordinal);
                var width = ParseSize(ExtractTagAttribute(match.Value, "width"), 480);
                var height = ParseSize(ExtractTagAttribute(match.Value, "height"), 270);
                AppendImageIfExists(body, mainPart, path, width, height);

                pos = match.Index + match.Length;
            }

            if (pos < line.Length)
            {
                var text = line[pos..].Trim();
                if (!string.IsNullOrWhiteSpace(text))
                    body.Append(CreateBodyParagraph(text));
            }
        }
    }

    private static Paragraph CreateHeading1(string text)
    {
        return CreateParagraph(text, "Heading1");
    }

    private static Paragraph CreateRightAlignedParagraph(string text)
    {
        var paragraph = new Paragraph(
            new ParagraphProperties(
                new Justification { Val = JustificationValues.Right }));
        paragraph.Append(new Run(
            new Text(text) { Space = SpaceProcessingModeValues.Preserve }));
        return paragraph;
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
                new FontSize { Val = "32" }), // 16pt
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

    private static void AppendImageIfExists(Body body, MainDocumentPart mainPart, string? imagePath, double widthPx, double heightPx)
    {
        if (string.IsNullOrWhiteSpace(imagePath) || !File.Exists(imagePath))
            return;

        var contentType = GetImageContentType(imagePath);
        if (string.IsNullOrWhiteSpace(contentType))
            return;

        var imagePart = mainPart.AddImagePart(contentType);
        using (var stream = File.OpenRead(imagePath))
        {
            imagePart.FeedData(stream);
        }

        var relId = mainPart.GetIdOfPart(imagePart);
        body.Append(CreateImageParagraph(relId, widthPx, heightPx));
        body.Append(CreateBlankParagraph());
    }

    private static string? GetImageContentType(string imagePath)
    {
        var ext = Path.GetExtension(imagePath).ToLowerInvariant();
        return ext switch
        {
            ".png" => "image/png",
            ".jpg" => "image/jpeg",
            ".jpeg" => "image/jpeg",
            ".gif" => "image/gif",
            ".webp" => "image/webp",
            ".avif" => "image/avif",
            _ => null
        };
    }

    private static Paragraph CreateImageParagraph(string relationshipId, double widthPx, double heightPx)
    {
        const long emusPerPixel = 9525;
        var cx = (long)Math.Max(32, widthPx) * emusPerPixel;
        var cy = (long)Math.Max(24, heightPx) * emusPerPixel;

        var element =
            new Drawing.Graphic(
                new Drawing.GraphicData(
                    new PIC.Picture(
                        new PIC.NonVisualPictureProperties(
                            new PIC.NonVisualDrawingProperties { Id = 0U, Name = "Agenda Image" },
                            new PIC.NonVisualPictureDrawingProperties()),
                        new PIC.BlipFill(
                            new Drawing.Blip { Embed = relationshipId },
                            new Drawing.Stretch(new Drawing.FillRectangle())),
                        new PIC.ShapeProperties(
                            new Drawing.Transform2D(
                                new Drawing.Offset { X = 0L, Y = 0L },
                                new Drawing.Extents { Cx = cx, Cy = cy }),
                            new Drawing.PresetGeometry(new Drawing.AdjustValueList()) { Preset = Drawing.ShapeTypeValues.Rectangle })))
                { Uri = "http://schemas.openxmlformats.org/drawingml/2006/picture" });

        var drawing = new DocumentFormat.OpenXml.Wordprocessing.Drawing(
            new DW.Inline(
                new DW.Extent { Cx = cx, Cy = cy },
                new DW.EffectExtent
                {
                    LeftEdge = 0L,
                    TopEdge = 0L,
                    RightEdge = 0L,
                    BottomEdge = 0L
                },
                new DW.DocProperties { Id = 1U, Name = "Agenda Image" },
                new DW.NonVisualGraphicFrameDrawingProperties(new Drawing.GraphicFrameLocks { NoChangeAspect = false }),
                element)
            {
                DistanceFromTop = 0U,
                DistanceFromBottom = 0U,
                DistanceFromLeft = 0U,
                DistanceFromRight = 0U
            });

        return new Paragraph(new Run(drawing));
    }

    private static string ExtractTagAttribute(string tag, string name)
    {
        var m = Regex.Match(tag, $@"{name}=""([0-9]+(?:\.[0-9]+)?)""", RegexOptions.IgnoreCase);
        return m.Success ? m.Groups[1].Value : "";
    }

    private static double ParseSize(string raw, double fallback)
    {
        if (double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out var value))
            return value;
        return fallback;
    }

    private static string StripImageTags(string? content)
    {
        return AgendaImageTagRegex.Replace(content ?? "", "").Trim();
    }

}
