using System.Text;
using System.Text.RegularExpressions;

namespace HWP2DocWinV10.Export;

/// <summary>
/// rhwp가 표로 출력한 문서 제목·부제를 Markdown 제목(#)으로 승격합니다.
/// </summary>
internal static class MarkdownRhwpStructureEnhancer
{
    private static readonly Regex TitleBannerTableRegex = new(
        @"^\|\s*(?:\|\s*)?(?<title>[^|\r\n]+?)\s*(?:\|\s*)?\|\s*$",
        RegexOptions.Compiled);

    private static readonly Regex BrTagRegex = new(
        @"<br\s*/?>",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public static string Enhance(string markdown)
    {
        if (string.IsNullOrWhiteSpace(markdown))
            return markdown;

        var lines = markdown.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
        var result = new List<string>(lines.Length);
        int i = 0;

        while (i < lines.Length)
        {
            if (TryConvertTitleBannerTable(lines, i, out string[] replacement, out int consumed))
            {
                result.AddRange(replacement);
                i += consumed;
                continue;
            }

            if (TryConvertSingleColumnTitleTable(lines, i, out replacement, out consumed))
            {
                result.AddRange(replacement);
                i += consumed;
                continue;
            }

            result.Add(lines[i]);
            i++;
        }

        return string.Join('\n', result);
    }

    private static bool TryConvertTitleBannerTable(
        string[] lines,
        int start,
        out string[] replacement,
        out int consumed)
    {
        replacement = [];
        consumed = 0;

        if (start + 1 >= lines.Length)
            return false;

        string header = lines[start].Trim();
        string separator = lines[start + 1].Trim();
        if (!MarkdownPipeTableNormalizer.IsPipeTableSeparator(separator))
            return false;

        var match = TitleBannerTableRegex.Match(header);
        if (!match.Success)
            return false;

        string title = CleanCellText(match.Groups["title"].Value);
        if (title.Length == 0 || title.Length > 48)
            return false;

        int nonEmptyCells = header.Split('|', StringSplitOptions.RemoveEmptyEntries)
            .Count(cell => CleanCellText(cell).Length > 0);
        if (nonEmptyCells != 1)
            return false;

        replacement = [$"# {title}", string.Empty];
        consumed = 2;
        while (start + consumed < lines.Length && lines[start + consumed].Trim().Length == 0)
            consumed++;

        return true;
    }

    private static bool TryConvertSingleColumnTitleTable(
        string[] lines,
        int start,
        out string[] replacement,
        out int consumed)
    {
        replacement = [];
        consumed = 0;

        if (start + 2 >= lines.Length)
            return false;

        string firstRow = lines[start].Trim();
        string separator = lines[start + 1].Trim();
        if (!MarkdownPipeTableNormalizer.IsPipeTableSeparator(separator))
            return false;

        if (!IsSingleColumnRow(firstRow))
            return false;

        string title = CleanCellText(ExtractSingleColumnCell(firstRow));
        if (title.Length == 0 || title.Length > 120)
            return false;

        var block = new List<string> { $"## {title}" };
        consumed = 2;

        while (start + consumed < lines.Length)
        {
            string row = lines[start + consumed].Trim();
            if (row.Length == 0)
            {
                consumed++;
                break;
            }

            if (!IsSingleColumnRow(row))
                break;

            if (MarkdownPipeTableNormalizer.IsPipeTableSeparator(row))
            {
                consumed++;
                continue;
            }

            string body = CleanCellText(ExtractSingleColumnCell(row));
            if (body.Length > 0)
                block.Add(body);

            consumed++;
        }

        if (block.Count <= 1)
            return false;

        block.Add(string.Empty);
        replacement = block.ToArray();
        return true;
    }

    private static bool IsSingleColumnRow(string line)
    {
        if (!line.Contains('|'))
            return false;

        string[] cells = line.Split('|', StringSplitOptions.RemoveEmptyEntries);
        return cells.Length == 1;
    }

    private static string ExtractSingleColumnCell(string line)
    {
        string[] cells = line.Split('|', StringSplitOptions.RemoveEmptyEntries);
        return cells.Length == 0 ? string.Empty : cells[0];
    }

    private static string CleanCellText(string text)
    {
        string cleaned = BrTagRegex.Replace(text, " ");
        cleaned = Regex.Replace(cleaned, @"\*\*(.+?)\*\*", "$1");
        cleaned = Regex.Replace(cleaned, @"\s+", " ").Trim();
        return cleaned;
    }
}
