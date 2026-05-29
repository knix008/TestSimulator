using System.Globalization;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using MeetingMinute.App.Models;

namespace MeetingMinute.App.Services;

public static class HtmlMeetingSerializer
{
    private static readonly Regex ImgTagRegex = new(
        @"<img\s[^>]*src=""([^""]+)""[^>]*?(?:width=""([0-9]+(?:\.[0-9]+)?)"")?[^>]*?(?:height=""([0-9]+(?:\.[0-9]+)?)"")?[^>]*?>",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public static void SaveAsHtml(string path, MeetingMinuteDocument doc, DocumentFormatSettings? format = null)
    {
        var fmt = format ?? new DocumentFormatSettings();
        var sb = new StringBuilder();
        var title = string.IsNullOrWhiteSpace(doc.Title) ? "제목 없음" : doc.Title.Trim();

        sb.AppendLine("<!DOCTYPE html>");
        sb.AppendLine("<html lang=\"ko\">");
        sb.AppendLine("<head>");
        sb.AppendLine("<meta charset=\"UTF-8\">");
        sb.AppendLine($"<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">");
        sb.AppendLine($"<title>{Escape(title)}</title>");
        sb.AppendLine("<style>");
        sb.AppendLine(BuildCss(fmt));
        sb.AppendLine("</style>");
        sb.AppendLine("</head>");
        sb.AppendLine("<body>");
        sb.AppendLine("<div class=\"page\">");

        // 메인 제목
        sb.AppendLine($"<h1 class=\"doc-title\">회의록</h1>");
        if (!string.IsNullOrWhiteSpace(doc.Author))
            sb.AppendLine($"<p class=\"author\">작성자 : {Escape(doc.Author.Trim())}</p>");

        sb.AppendLine("<hr>");

        // 1. 회의 제목
        sb.AppendLine("<h2>1. 회의 제목</h2>");
        sb.AppendLine($"<p>{Escape(title)}</p>");

        // 2. 시간/장소
        sb.AppendLine("<h2>2. 시간/장소</h2>");
        var (datePart, timePart) = SplitDateAndTime(doc.DateTimeText);
        sb.AppendLine("<ul>");
        sb.AppendLine($"<li><strong>날짜</strong>: {Escape(datePart)}</li>");
        sb.AppendLine($"<li><strong>시간</strong>: {Escape(timePart)}</li>");
        sb.AppendLine($"<li><strong>장소</strong>: {Escape(doc.Location)}</li>");
        sb.AppendLine($"<li><strong>참석자</strong>: {Escape(FormatAttendees(doc.Attendees))}</li>");
        sb.AppendLine("</ul>");

        // 3. 안건 및 논의
        sb.AppendLine("<h2>3. 안건 및 논의</h2>");
        AppendContentHtml(sb, doc.AgendaAndDiscussion, path);

        AppendSection(sb, "4. 결정 사항", doc.Decisions);
        AppendSection(sb, "5. 액션 아이템", doc.ActionItems);
        AppendSection(sb, "6. 차기 회의", doc.NextMeeting);
        AppendSection(sb, "7. 기타 메모", doc.Notes);

        sb.AppendLine("</div>");
        sb.AppendLine("</body>");
        sb.AppendLine("</html>");

        File.WriteAllText(path, sb.ToString(), new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
    }

    private static string BuildCss(DocumentFormatSettings fmt)
    {
        var I = CultureInfo.InvariantCulture;
        var marginMm = fmt.PageMarginMm.ToString(I);
        var fontPt = fmt.BodyFontSizePt.ToString(I);
        var lineHeight = fmt.LineSpacing.ToString(I);
        var font = fmt.FontFamily;
        var titlePt = Math.Max(24.0, fmt.BodyFontSizePt * 2.5).ToString(I);
        var h2Pt = (fmt.BodyFontSizePt + 3).ToString(I);

        var sb = new StringBuilder();
        sb.AppendLine($"body {{ font-family: '{font}', 'Malgun Gothic', sans-serif; font-size: {fontPt}pt; line-height: {lineHeight}; color: #1a1a1a; background: #fff; margin: 0; padding: 0; }}");
        sb.AppendLine($".page {{ max-width: 210mm; margin: 0 auto; padding: {marginMm}mm; box-sizing: border-box; }}");
        sb.AppendLine($"h1.doc-title {{ font-size: {titlePt}pt; text-align: center; margin-bottom: 4px; }}");
        sb.AppendLine("p.author { text-align: right; margin-top: 2px; margin-bottom: 8px; }");
        sb.AppendLine("hr { border: none; border-top: 1px solid #ccc; margin: 12px 0; }");
        sb.AppendLine($"h2 {{ font-size: {h2Pt}pt; margin-top: 16px; margin-bottom: 4px; }}");
        sb.AppendLine("p, li { margin: 2px 0; }");
        sb.AppendLine("img { max-width: 100%; display: block; margin: 8px 0; }");
        sb.AppendLine($"@media print {{ body {{ font-size: {fontPt}pt; }} .page {{ padding: {marginMm}mm; max-width: none; }} }}");
        return sb.ToString();
    }

    private static void AppendSection(StringBuilder sb, string header, string? content)
    {
        sb.AppendLine($"<h2>{Escape(header)}</h2>");
        var lines = (content ?? "").Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');
        var cleaned = lines.Select(l => ImgTagRegex.Replace(l, "").Trim()).Where(l => l.Length > 0).ToArray();
        if (cleaned.Length == 0)
        {
            sb.AppendLine("<p></p>");
            return;
        }
        foreach (var line in cleaned)
            sb.AppendLine($"<p>{Escape(line)}</p>");
    }

    private static void AppendContentHtml(StringBuilder sb, string? content, string outputPath)
    {
        var lines = (content ?? "").Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');
        var outputDir = Path.GetDirectoryName(outputPath) ?? ".";
        foreach (var line in lines)
        {
            if (!ImgTagRegex.IsMatch(line))
            {
                if (!string.IsNullOrWhiteSpace(line))
                    sb.AppendLine($"<p>{Escape(line)}</p>");
                continue;
            }

            var pos = 0;
            foreach (Match match in ImgTagRegex.Matches(line))
            {
                if (match.Index > pos)
                {
                    var text = line[pos..match.Index].Trim();
                    if (!string.IsNullOrWhiteSpace(text))
                        sb.AppendLine($"<p>{Escape(text)}</p>");
                }

                var imgPath = match.Groups[1].Value.Replace("/", "\\", StringComparison.Ordinal);
                var widthStr = match.Groups[2].Value;
                var heightStr = match.Groups[3].Value;

                if (File.Exists(imgPath))
                {
                    // Use relative path if the image is under the output directory, else embed as data URI
                    var relPath = GetRelativePath(outputDir, imgPath);
                    var styleAttr = "";
                    if (!string.IsNullOrEmpty(widthStr))
                        styleAttr = $" style=\"max-width:{widthStr}px\"";
                    sb.AppendLine($"<img src=\"{EscapeAttr(relPath)}\"{styleAttr} alt=\"agenda-image\">");
                }

                pos = match.Index + match.Length;
            }

            if (pos < line.Length)
            {
                var tail = line[pos..].Trim();
                if (!string.IsNullOrWhiteSpace(tail))
                    sb.AppendLine($"<p>{Escape(tail)}</p>");
            }
        }
    }

    private static string GetRelativePath(string baseDir, string absolutePath)
    {
        try
        {
            return Path.GetRelativePath(baseDir, absolutePath).Replace("\\", "/", StringComparison.Ordinal);
        }
        catch
        {
            return absolutePath.Replace("\\", "/", StringComparison.Ordinal);
        }
    }

    private static string FormatAttendees(string? attendees) =>
        (attendees ?? "").Replace("\r\n", ", ", StringComparison.Ordinal)
                         .Replace('\n', ',')
                         .Trim(' ', ',');

    private static (string DatePart, string TimePart) SplitDateAndTime(string? dt)
    {
        var raw = dt?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(raw)) return ("", "");
        var parts = raw.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
        return parts.Length == 2 ? (parts[0], parts[1]) : (raw, "");
    }

    private static string Escape(string? s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        return s.Replace("&", "&amp;", StringComparison.Ordinal)
                .Replace("<", "&lt;", StringComparison.Ordinal)
                .Replace(">", "&gt;", StringComparison.Ordinal)
                .Replace("\"", "&quot;", StringComparison.Ordinal);
    }

    private static string EscapeAttr(string? s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        return s.Replace("&", "&amp;", StringComparison.Ordinal)
                .Replace("\"", "&quot;", StringComparison.Ordinal);
    }
}
