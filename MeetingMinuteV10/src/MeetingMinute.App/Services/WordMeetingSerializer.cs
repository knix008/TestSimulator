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
        @"<img\s[^>]*src=""([^""]+)""[^>]*?>",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public static void SaveAsDocx(string path, MeetingMinuteDocument doc, DocumentFormatSettings? format = null)
    {
        var fmt = format ?? new DocumentFormatSettings();

        using var wordDoc = WordprocessingDocument.Create(path, WordprocessingDocumentType.Document);
        var mainPart = wordDoc.AddMainDocumentPart();
        mainPart.Document = new Document();
        var body = new Body();
        mainPart.Document.Append(body);

        var title = string.IsNullOrWhiteSpace(doc.Title) ? "제목 없음" : doc.Title.Trim();
        body.Append(CreateMainTitle("회의록", fmt));
        if (!string.IsNullOrWhiteSpace(doc.Author))
            body.Append(CreateRightAlignedParagraph($"작성자 : {doc.Author.Trim()}", fmt));
        body.Append(CreateBlankParagraph(fmt));

        AppendSection(body, "1. 회의 제목", title, fmt);

        body.Append(CreateHeading2("2. 시간/장소", fmt));
        var (datePart, timePart) = SplitDateAndTime(doc.DateTimeText);
        body.Append(CreateBodyParagraph($"날짜: {datePart}", fmt));
        body.Append(CreateBodyParagraph($"시간: {timePart}", fmt));
        body.Append(CreateBodyParagraph($"장소: {doc.Location}", fmt));
        body.Append(CreateBodyParagraph(
            $"참석자: {(doc.Attendees ?? "").Replace("\r\n", ", ", StringComparison.Ordinal).Replace('\n', ',').Trim(' ', ',')}",
            fmt));
        body.Append(CreateBlankParagraph(fmt));

        body.Append(CreateHeading2("3. 안건 및 논의", fmt));
        AppendAgendaWithImages(body, mainPart, doc.AgendaAndDiscussion, fmt);
        body.Append(CreateBlankParagraph(fmt));
        AppendSection(body, "4. 결정 사항", doc.Decisions, fmt);
        AppendSection(body, "5. 액션 아이템", doc.ActionItems, fmt);
        AppendSection(body, "6. 차기 회의", doc.NextMeeting, fmt);
        AppendSection(body, "7. 기타 메모", doc.Notes, fmt);

        // 페이지 여백 적용
        var marginTwips = (int)(fmt.PageMarginMm * 56.69);
        var marginU = (uint)Math.Max(0, marginTwips);
        body.Append(new SectionProperties(
            new PageMargin
            {
                Top = marginTwips,
                Bottom = marginTwips,
                Left = marginU,
                Right = marginU
            }));

        mainPart.Document.Save();
    }

    // ── 단락 빌더 ──────────────────────────────────────────────────────────

    private static RunProperties BuildBodyRunProps(DocumentFormatSettings fmt)
    {
        var halfPt = ((int)(fmt.BodyFontSizePt * 2)).ToString(CultureInfo.InvariantCulture);
        return new RunProperties(
            new RunFonts { Ascii = fmt.FontFamily, HighAnsi = fmt.FontFamily, EastAsia = fmt.FontFamily },
            new FontSize { Val = halfPt },
            new FontSizeComplexScript { Val = halfPt });
    }

    private static RunProperties BuildBoldRunProps(DocumentFormatSettings fmt, double sizePt)
    {
        var halfPt = ((int)(sizePt * 2)).ToString(CultureInfo.InvariantCulture);
        return new RunProperties(
            new RunFonts { Ascii = fmt.FontFamily, HighAnsi = fmt.FontFamily, EastAsia = fmt.FontFamily },
            new Bold(),
            new FontSize { Val = halfPt },
            new FontSizeComplexScript { Val = halfPt });
    }

    private static ParagraphProperties BuildBodyParaProps(DocumentFormatSettings fmt)
    {
        var lineVal = ((int)(fmt.LineSpacing * 240)).ToString(CultureInfo.InvariantCulture);
        return new ParagraphProperties(
            new SpacingBetweenLines { Line = lineVal, LineRule = LineSpacingRuleValues.Auto });
    }

    private static Paragraph CreateMainTitle(string text, DocumentFormatSettings fmt)
    {
        var titleSizePt = Math.Max(24.0, fmt.BodyFontSizePt * 2.5);
        var lineVal = ((int)(fmt.LineSpacing * 240)).ToString(CultureInfo.InvariantCulture);
        var para = new Paragraph(
            new ParagraphProperties(
                new Justification { Val = JustificationValues.Center },
                new SpacingBetweenLines { Line = lineVal, LineRule = LineSpacingRuleValues.Auto }));
        para.Append(new Run(BuildBoldRunProps(fmt, titleSizePt),
            new Text(text ?? "") { Space = SpaceProcessingModeValues.Preserve }));
        return para;
    }

    private static Paragraph CreateHeading2(string text, DocumentFormatSettings fmt)
    {
        var headingSizePt = fmt.BodyFontSizePt + 4;
        var lineVal = ((int)(fmt.LineSpacing * 240)).ToString(CultureInfo.InvariantCulture);
        var para = new Paragraph(
            new ParagraphProperties(
                new SpacingBetweenLines { Line = lineVal, LineRule = LineSpacingRuleValues.Auto }));
        para.Append(new Run(BuildBoldRunProps(fmt, headingSizePt),
            new Text(text ?? "") { Space = SpaceProcessingModeValues.Preserve }));
        return para;
    }

    private static Paragraph CreateRightAlignedParagraph(string text, DocumentFormatSettings fmt)
    {
        var lineVal = ((int)(fmt.LineSpacing * 240)).ToString(CultureInfo.InvariantCulture);
        var para = new Paragraph(
            new ParagraphProperties(
                new Justification { Val = JustificationValues.Right },
                new SpacingBetweenLines { Line = lineVal, LineRule = LineSpacingRuleValues.Auto }));
        para.Append(new Run(BuildBodyRunProps(fmt),
            new Text(text ?? "") { Space = SpaceProcessingModeValues.Preserve }));
        return para;
    }

    private static Paragraph CreateBodyParagraph(string text, DocumentFormatSettings fmt)
    {
        var para = new Paragraph(BuildBodyParaProps(fmt));
        para.Append(new Run(BuildBodyRunProps(fmt),
            new Text(text ?? "") { Space = SpaceProcessingModeValues.Preserve }));
        return para;
    }

    private static Paragraph CreateBlankParagraph(DocumentFormatSettings fmt) =>
        CreateBodyParagraph("", fmt);

    // ── 섹션 / 안건 추가 ───────────────────────────────────────────────────

    private static void AppendSection(Body body, string header, string? content, DocumentFormatSettings fmt)
    {
        body.Append(CreateHeading2(header, fmt));
        var lines = (content ?? "").Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');
        if (lines.All(string.IsNullOrWhiteSpace))
            body.Append(CreateBodyParagraph("", fmt));
        else
            foreach (var line in lines)
                body.Append(CreateBodyParagraph(line, fmt));
        body.Append(CreateBlankParagraph(fmt));
    }

    private static void AppendAgendaWithImages(
        Body body, MainDocumentPart mainPart, string? content, DocumentFormatSettings fmt)
    {
        var lines = (content ?? "").Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');
        if (lines.All(string.IsNullOrWhiteSpace))
        {
            body.Append(CreateBodyParagraph("", fmt));
            return;
        }

        foreach (var line in lines)
        {
            if (!AgendaImageTagRegex.IsMatch(line))
            {
                body.Append(CreateBodyParagraph(line, fmt));
                continue;
            }

            var pos = 0;
            foreach (Match match in AgendaImageTagRegex.Matches(line))
            {
                if (match.Index > pos)
                {
                    var text = line[pos..match.Index].Trim();
                    if (!string.IsNullOrWhiteSpace(text))
                        body.Append(CreateBodyParagraph(text, fmt));
                }

                var imgPath = match.Groups[1].Value.Replace("/", "\\", StringComparison.Ordinal);
                var width = ParseSize(ExtractTagAttribute(match.Value, "width"), 480);
                var height = ParseSize(ExtractTagAttribute(match.Value, "height"), 270);
                AppendImageIfExists(body, mainPart, imgPath, width, height, fmt);

                pos = match.Index + match.Length;
            }

            if (pos < line.Length)
            {
                var text = line[pos..].Trim();
                if (!string.IsNullOrWhiteSpace(text))
                    body.Append(CreateBodyParagraph(text, fmt));
            }
        }
    }

    // ── 이미지 처리 ────────────────────────────────────────────────────────

    private static void AppendImageIfExists(
        Body body, MainDocumentPart mainPart, string? imagePath,
        double widthPx, double heightPx, DocumentFormatSettings fmt)
    {
        if (string.IsNullOrWhiteSpace(imagePath) || !File.Exists(imagePath))
            return;

        var contentType = GetImageContentType(imagePath);
        if (string.IsNullOrWhiteSpace(contentType))
            return;

        var imagePart = mainPart.AddImagePart(contentType);
        using (var stream = File.OpenRead(imagePath))
            imagePart.FeedData(stream);

        var relId = mainPart.GetIdOfPart(imagePart);
        body.Append(CreateImageParagraph(relId, widthPx, heightPx));
        body.Append(CreateBlankParagraph(fmt));
    }

    private static string? GetImageContentType(string imagePath)
    {
        var ext = Path.GetExtension(imagePath).ToLowerInvariant();
        return ext switch
        {
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
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
                            new Drawing.PresetGeometry(new Drawing.AdjustValueList())
                            { Preset = Drawing.ShapeTypeValues.Rectangle })))
                { Uri = "http://schemas.openxmlformats.org/drawingml/2006/picture" });

        var drawing = new DocumentFormat.OpenXml.Wordprocessing.Drawing(
            new DW.Inline(
                new DW.Extent { Cx = cx, Cy = cy },
                new DW.EffectExtent { LeftEdge = 0L, TopEdge = 0L, RightEdge = 0L, BottomEdge = 0L },
                new DW.DocProperties { Id = 1U, Name = "Agenda Image" },
                new DW.NonVisualGraphicFrameDrawingProperties(
                    new Drawing.GraphicFrameLocks { NoChangeAspect = false }),
                element)
            {
                DistanceFromTop = 0U,
                DistanceFromBottom = 0U,
                DistanceFromLeft = 0U,
                DistanceFromRight = 0U
            });

        return new Paragraph(new Run(drawing));
    }

    // ── 유틸리티 ───────────────────────────────────────────────────────────

    private static (string DatePart, string TimePart) SplitDateAndTime(string? dateTimeText)
    {
        var raw = dateTimeText?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(raw)) return ("", "");
        var parts = raw.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
        return parts.Length == 2 ? (parts[0], parts[1]) : (raw, "");
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
}
