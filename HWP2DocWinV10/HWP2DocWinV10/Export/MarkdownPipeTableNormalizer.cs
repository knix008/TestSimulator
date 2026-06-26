using System.Text;
using System.Text.RegularExpressions;

namespace HWP2DocWinV10.Export;

/// <summary>
/// GFM 파이프 테이블을 미리보기·편집에 맞게 정리합니다.
/// </summary>
internal static class MarkdownPipeTableNormalizer
{
    public static string Normalize(string markdown)
    {
        if (string.IsNullOrWhiteSpace(markdown))
            return string.Empty;

        string text = markdown.Replace("\r\n", "\n").Replace('\r', '\n');
        text = EnsureSeparators(text);
        text = EnsureBlankLinesAroundTables(text);
        return text;
    }

    private static string EnsureSeparators(string text)
    {
        var lines = text.Split('\n');
        var result = new List<string>(lines.Length + 8);
        bool inHtmlTable = false;

        for (int i = 0; i < lines.Length; i++)
        {
            string line = lines[i];
            if (ContainsHtmlTableStart(line))
                inHtmlTable = true;

            result.Add(line);

            if (inHtmlTable)
            {
                if (ContainsHtmlTableEnd(line))
                    inHtmlTable = false;

                continue;
            }

            if (!IsPipeTableRow(line) || IsPipeTableSeparator(line))
                continue;

            bool previousIsTable = i > 0 &&
                                   (IsPipeTableRow(lines[i - 1]) || IsPipeTableSeparator(lines[i - 1]));
            if (previousIsTable)
                continue;

            if (i + 1 < lines.Length && IsPipeTableSeparator(lines[i + 1]))
                continue;

            int columns = CountPipeColumns(line);
            if (columns >= 1)
                result.Add(BuildPipeSeparator(columns));
        }

        return string.Join('\n', result);
    }

    private static string EnsureBlankLinesAroundTables(string text)
    {
        var lines = text.Split('\n');
        var result = new List<string>(lines.Length + 12);
        bool inHtmlTable = false;
        bool inTableBody = false;

        for (int i = 0; i < lines.Length; i++)
        {
            string line = lines[i];
            bool isSeparator = IsPipeTableSeparator(line);
            bool isHeaderRow = !isSeparator && IsPipeTableRow(line);
            bool isPipeTableLine = isHeaderRow || isSeparator;

            if (ContainsHtmlTableStart(line))
                inHtmlTable = true;

            if (!inHtmlTable && result.Count > 0 && result[^1].Length > 0)
            {
                bool previousIsTable = IsPipeTableRow(result[^1]) || IsPipeTableSeparator(result[^1]);

                // 새 표의 헤더(다음 줄이 구분선)가 이전 표 본문 바로 뒤에 빈 줄 없이 이어지면
                // Markdig가 이를 별개 표로 인식하지 못하고 이전 표의 데이터 행으로 합쳐버립니다.
                bool startsNewAdjacentTable = inTableBody && isHeaderRow &&
                    i + 1 < lines.Length && IsPipeTableSeparator(lines[i + 1]);

                if ((isPipeTableLine && !previousIsTable) || startsNewAdjacentTable)
                    result.Add(string.Empty);
            }

            result.Add(line);

            if (inHtmlTable && ContainsHtmlTableEnd(line))
                inHtmlTable = false;

            if (!inHtmlTable)
            {
                if (isSeparator)
                    inTableBody = true;
                else if (!isHeaderRow)
                    inTableBody = false;
            }

            if (!inHtmlTable && isPipeTableLine)
            {
                bool nextIsTable = i + 1 < lines.Length &&
                                   (IsPipeTableRow(lines[i + 1]) || IsPipeTableSeparator(lines[i + 1]));
                if (!nextIsTable && i + 1 < lines.Length && lines[i + 1].Length > 0)
                    result.Add(string.Empty);
            }
        }

        return string.Join('\n', result);
    }

    private static bool ContainsHtmlTableStart(string line)
        => line.Contains("<table", StringComparison.OrdinalIgnoreCase);

    private static bool ContainsHtmlTableEnd(string line)
        => line.Contains("</table>", StringComparison.OrdinalIgnoreCase);

    private static bool IsPipeTableRow(string line)
    {
        string trimmed = line.Trim();
        if (trimmed.Length == 0)
            return false;

        if (trimmed.StartsWith('<') || trimmed.Contains("<table", StringComparison.OrdinalIgnoreCase))
            return false;

        return trimmed.Contains('|') &&
               trimmed.Trim('|').Contains('|') &&
               !trimmed.StartsWith("```", StringComparison.Ordinal);
    }

    internal static bool IsPipeTableSeparator(string line)
    {
        string trimmed = line.Trim();
        if (!trimmed.Contains('|'))
            return false;

        return Regex.IsMatch(
            trimmed,
            @"^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$");
    }

    private static int CountPipeColumns(string line)
    {
        string trimmed = line.Trim().Trim('|');
        if (string.IsNullOrEmpty(trimmed))
            return 0;

        return trimmed.Split('|').Length;
    }

    private static string BuildPipeSeparator(int columns)
    {
        var cells = Enumerable.Repeat("---", Math.Max(columns, 1));
        return "| " + string.Join(" | ", cells) + " |";
    }
}
