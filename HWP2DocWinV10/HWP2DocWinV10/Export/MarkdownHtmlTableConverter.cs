using System.Net;
using System.Text;
using System.Text.RegularExpressions;

namespace HWP2DocWinV10.Export;

/// <summary>
/// unhwp/rhwp가 출력한 HTML &lt;table&gt; 블록을 GFM 파이프 표로 변환합니다.
/// </summary>
internal static class MarkdownHtmlTableConverter
{
    private static readonly Regex TableBlockRegex = new(
        @"<table\b[\s\S]*?</table>",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex RowRegex = new(
        @"<tr\b[^>]*>([\s\S]*?)</tr>",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex CellRegex = new(
        @"<t([dh])\b([^>]*)>([\s\S]*?)</t\1>",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex BrTagRegex = new(
        @"<br\s*/?>",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public static string Convert(string markdown)
    {
        if (string.IsNullOrWhiteSpace(markdown))
            return string.Empty;

        string text = markdown.Replace("\r\n", "\n").Replace('\r', '\n');
        return TableBlockRegex.Replace(text, match => ConvertTableBlock(match.Value));
    }

    private static string ConvertTableBlock(string htmlTable)
    {
        var rows = new List<TableRow>();
        foreach (Match rowMatch in RowRegex.Matches(htmlTable))
        {
            TableRow? row = ParseRow(rowMatch.Groups[1].Value);
            if (row != null && row.Cells.Count > 0)
                rows.Add(row);
        }

        if (rows.Count == 0)
            return string.Empty;

        int columnCount = rows.Max(static row => row.Cells.Count);
        if (columnCount == 0)
            return string.Empty;

        var lines = new List<string>(rows.Count + 1);
        bool wroteSeparator = false;

        for (int i = 0; i < rows.Count; i++)
        {
            string[] cells = PadCells(rows[i].Cells, columnCount);
            lines.Add(BuildPipeRow(cells));

            bool isHeaderRow = rows[i].IsHeader;
            bool nextIsData = i + 1 < rows.Count && !rows[i + 1].IsHeader;
            if (!wroteSeparator && (isHeaderRow || (i == 0 && rows.Count > 1) || nextIsData))
            {
                lines.Add(BuildPipeSeparator(columnCount));
                wroteSeparator = true;
            }
        }

        if (!wroteSeparator && lines.Count == 1)
            lines.Add(BuildPipeSeparator(columnCount));

        return string.Join('\n', lines);
    }

    private static TableRow? ParseRow(string rowHtml)
    {
        var row = new TableRow();
        foreach (Match cellMatch in CellRegex.Matches(rowHtml))
        {
            bool isHeader = string.Equals(cellMatch.Groups[1].Value, "h", StringComparison.OrdinalIgnoreCase);
            string attributes = cellMatch.Groups[2].Value;
            string innerHtml = cellMatch.Groups[3].Value;

            int colspan = ParseColspan(attributes);
            string text = HtmlCellToMarkdown(innerHtml);
            row.Cells.Add(text);
            row.IsHeader |= isHeader;

            for (int i = 1; i < colspan; i++)
                row.Cells.Add(string.Empty);
        }

        return row.Cells.Count == 0 ? null : row;
    }

    private static int ParseColspan(string attributes)
    {
        Match match = Regex.Match(attributes, @"\bcolspan\s*=\s*[""']?(\d+)[""']?", RegexOptions.IgnoreCase);
        if (!match.Success)
            return 1;

        return int.TryParse(match.Groups[1].Value, out int value) ? Math.Max(1, value) : 1;
    }

    private static string HtmlCellToMarkdown(string html)
    {
        if (string.IsNullOrWhiteSpace(html))
            return string.Empty;

        string text = html.Trim();
        text = BrTagRegex.Replace(text, " ");
        text = Regex.Replace(
            text,
            @"<img\b[^>]*\bsrc\s*=\s*[""']([^""']+)[""'][^>]*\balt\s*=\s*[""']([^""']*)[""'][^>]*/?>",
            "![$2]($1)",
            RegexOptions.IgnoreCase);
        text = Regex.Replace(
            text,
            @"<img\b[^>]*\bsrc\s*=\s*[""']([^""']+)[""'][^>]*/?>",
            "![]($1)",
            RegexOptions.IgnoreCase);
        text = Regex.Replace(
            text,
            @"<a\b[^>]*\bhref\s*=\s*[""']([^""']+)[""'][^>]*>([\s\S]*?)</a>",
            "[$2]($1)",
            RegexOptions.IgnoreCase);
        text = Regex.Replace(text, @"<(?:strong|b)\b[^>]*>([\s\S]*?)</(?:strong|b)>", "**$1**", RegexOptions.IgnoreCase);
        text = Regex.Replace(text, @"<(?:em|i)\b[^>]*>([\s\S]*?)</(?:em|i)>", "*$1*", RegexOptions.IgnoreCase);
        text = Regex.Replace(text, @"<[^>]+>", string.Empty);
        text = WebUtility.HtmlDecode(text);
        text = Regex.Replace(text, @"[ \t\f\v]+", " ").Trim();
        return EscapePipeCharacters(text);
    }

    private static string EscapePipeCharacters(string text) =>
        text.Replace("|", "\\|", StringComparison.Ordinal);

    private static string[] PadCells(IReadOnlyList<string> cells, int columnCount)
    {
        var padded = new string[columnCount];
        for (int i = 0; i < columnCount; i++)
            padded[i] = i < cells.Count ? cells[i] : string.Empty;

        return padded;
    }

    private static string BuildPipeRow(IReadOnlyList<string> cells) =>
        "| " + string.Join(" | ", cells) + " |";

    private static string BuildPipeSeparator(int columns)
    {
        var cells = Enumerable.Repeat("---", Math.Max(columns, 1));
        return "| " + string.Join(" | ", cells) + " |";
    }

    private sealed class TableRow
    {
        public List<string> Cells { get; } = [];
        public bool IsHeader { get; set; }
    }
}
