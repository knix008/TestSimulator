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
        text = JoinMultilineTableRows(text);
        text = RemoveEmptyTableArtifacts(text);
        text = RemoveEmptyPipeRows(text);
        text = RemoveOrphanSeparators(text);
        text = EnsureSeparators(text);
        text = RemoveOrphanSeparators(text);
        text = RemoveEmptyPipeRows(text);
        text = EnsureBlankLinesAroundImages(text);
        text = EnsureBlankLinesAroundTables(text);
        text = RemoveEmptyPipeRows(text);
        text = RemoveOrphanSeparators(text);
        return text;
    }

    private static string JoinMultilineTableRows(string text)
    {
        // unhwp는 셀 안의 줄바꿈을 <br> 태그로 표시하면서도 그 뒤에 실제 개행(\n)까지 함께
        // 출력하는 경우가 있습니다. GFM 표 행은 한 줄이어야 하므로, "|"로 시작했지만 "|"로
        // 끝나지 않은 줄은 다음 줄들을 같은 행으로 합쳐 한 줄로 복원합니다.
        var lines = text.Split('\n');
        var result = new List<string>(lines.Length);
        bool inHtmlTable = false;

        for (int i = 0; i < lines.Length; i++)
        {
            string line = lines[i];
            if (ContainsHtmlTableStart(line))
                inHtmlTable = true;

            if (inHtmlTable)
            {
                result.Add(line);
                if (ContainsHtmlTableEnd(line))
                    inHtmlTable = false;

                continue;
            }

            string trimmedLine = line.TrimEnd();
            bool looksLikeBrokenRow = trimmedLine.TrimStart().StartsWith('|') &&
                !IsPipeTableSeparator(trimmedLine) &&
                !trimmedLine.EndsWith('|');

            if (!looksLikeBrokenRow)
            {
                result.Add(line);
                continue;
            }

            var buffer = new StringBuilder(trimmedLine);
            int j = i + 1;
            while (j < lines.Length)
            {
                string nextTrimmed = lines[j].Trim();

                if (nextTrimmed.StartsWith('|') ||
                    ContainsHtmlTableStart(lines[j]) ||
                    Regex.IsMatch(nextTrimmed, @"^#{1,6}\s") ||
                    nextTrimmed.StartsWith("![", StringComparison.Ordinal) ||
                    nextTrimmed.StartsWith("<img", StringComparison.OrdinalIgnoreCase) ||
                    nextTrimmed.StartsWith("<!--", StringComparison.Ordinal))
                    break;

                if (nextTrimmed.Length > 0)
                    buffer.Append(' ').Append(nextTrimmed);

                bool closesRow = nextTrimmed.EndsWith('|');
                j++;

                if (closesRow)
                    break;
            }

            result.Add(buffer.ToString());
            i = j - 1;
        }

        return string.Join('\n', result);
    }

    private static string RemoveEmptyTableArtifacts(string text)
    {
        var lines = text.Split('\n');
        var result = new List<string>(lines.Length);
        bool inHtmlTable = false;

        for (int i = 0; i < lines.Length; i++)
        {
            string line = lines[i];
            if (ContainsHtmlTableStart(line))
                inHtmlTable = true;

            if (!inHtmlTable)
            {
                bool isSeparator = IsPipeTableSeparator(line);
                bool isRow = !isSeparator && IsPipeTableRow(line);

                if (isRow && IsAllCellsEmpty(line))
                {
                    // 내용이 전혀 없는 표 행("| | | | |")은 시각적으로만 표처럼 보이므로 제거합니다.
                    // 빈 줄 하나를 건너뛴 다음 줄이 구분선이면 짝이므로 함께 제거합니다.
                    int next = i + 1;
                    if (next < lines.Length && lines[next].Trim().Length == 0)
                        next++;

                    if (next < lines.Length && IsPipeTableSeparator(lines[next]))
                        i = next;

                    continue;
                }

                if (isRow)
                {
                    bool nextIsSeparator = i + 1 < lines.Length && IsPipeTableSeparator(lines[i + 1]);
                    if (nextIsSeparator)
                    {
                        // 헤더+구분선만 있고 실제 데이터 행이 하나도 없는 표는 통째로 제거합니다.
                        bool hasDataRow = i + 2 < lines.Length &&
                            !IsPipeTableSeparator(lines[i + 2]) &&
                            IsPipeTableRow(lines[i + 2]);

                        if (!hasDataRow)
                        {
                            i++;
                            continue;
                        }
                    }
                }
            }

            result.Add(line);

            if (inHtmlTable && ContainsHtmlTableEnd(line))
                inHtmlTable = false;
        }

        return string.Join('\n', result);
    }

    private static string RemoveEmptyPipeRows(string text)
    {
        // "| |", "|  |  |" 등 내용 없는 파이프 행은 본문에 그대로 노출되므로 제거합니다.
        var lines = text.Split('\n');
        var result = new List<string>(lines.Length);
        bool inHtmlTable = false;

        for (int i = 0; i < lines.Length; i++)
        {
            string line = lines[i];
            if (ContainsHtmlTableStart(line))
                inHtmlTable = true;

            if (inHtmlTable)
            {
                result.Add(line);
                if (ContainsHtmlTableEnd(line))
                    inHtmlTable = false;

                continue;
            }

            if (IsEmptyPipeRow(line))
            {
                int next = i + 1;
                if (next < lines.Length && lines[next].Trim().Length == 0)
                    next++;

                if (next < lines.Length && IsPipeTableSeparator(lines[next]))
                    i = next;

                continue;
            }

            result.Add(line);
        }

        return CollapseExtraBlankLines(string.Join('\n', result));
    }

    private static bool IsEmptyPipeRow(string line)
    {
        string trimmed = line.Trim();
        if (!trimmed.StartsWith('|'))
            return false;

        if (IsPipeTableSeparator(trimmed))
            return false;

        return IsAllCellsEmpty(trimmed);
    }

    private static string CollapseExtraBlankLines(string text)
    {
        return Regex.Replace(text, @"\n{3,}", "\n\n").TrimEnd();
    }

    private static string RemoveOrphanSeparators(string text)
    {
        // 짝이 되는 헤더 행 바로 다음이 아닌 구분선(| --- |, | :--- | 등)은
        // Markdig가 표로 인식하지 못해 그대로 텍스트로 노출되므로 제거합니다.
        var lines = text.Split('\n');
        var result = new List<string>(lines.Length);
        bool inHtmlTable = false;

        for (int i = 0; i < lines.Length; i++)
        {
            string line = lines[i];
            if (ContainsHtmlTableStart(line))
                inHtmlTable = true;

            if (inHtmlTable)
            {
                result.Add(line);
                if (ContainsHtmlTableEnd(line))
                    inHtmlTable = false;

                continue;
            }

            if (IsPipeTableSeparator(line))
            {
                if (!IsValidSeparatorPosition(lines, i))
                    continue;

                if (result.Count > 0 && IsPipeTableSeparator(result[^1]))
                    continue;
            }

            result.Add(line);
        }

        return string.Join('\n', result);
    }

    private static bool IsValidSeparatorPosition(string[] lines, int separatorIndex)
    {
        int headerIndex = FindPreviousNonEmptyLineIndex(lines, separatorIndex);
        if (headerIndex < 0)
            return false;

        if (!IsPipeTableRow(lines[headerIndex]) || IsPipeTableSeparator(lines[headerIndex]))
            return false;

        int beforeHeader = FindPreviousNonEmptyLineIndex(lines, headerIndex);
        if (beforeHeader < 0)
            return true;

        if (IsPipeTableSeparator(lines[beforeHeader]))
            return false;

        return !IsPipeTableRow(lines[beforeHeader]);
    }

    private static int FindPreviousNonEmptyLineIndex(string[] lines, int fromIndex)
    {
        for (int i = fromIndex - 1; i >= 0; i--)
        {
            if (lines[i].Trim().Length > 0)
                return i;
        }

        return -1;
    }

    private static bool IsAllCellsEmpty(string line)
    {
        string trimmed = line.Trim().Trim('|');
        if (trimmed.Length == 0)
            return true;

        foreach (string cell in trimmed.Split('|'))
        {
            if (cell.Trim().Length > 0)
                return false;
        }

        return true;
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

    private static string EnsureBlankLinesAroundImages(string text)
    {
        var lines = text.Split('\n');
        var result = new List<string>(lines.Length + 8);

        for (int i = 0; i < lines.Length; i++)
        {
            string line = lines[i];
            string trimmed = line.Trim();
            bool isImage = trimmed.StartsWith("![", StringComparison.Ordinal) ||
                           trimmed.StartsWith("<img", StringComparison.OrdinalIgnoreCase);

            if (isImage && result.Count > 0 && result[^1].Length > 0)
            {
                bool previousIsTable = IsPipeTableRow(result[^1]) || IsPipeTableSeparator(result[^1]);
                if (previousIsTable)
                    result.Add(string.Empty);
            }

            result.Add(line);

            if (isImage && i + 1 < lines.Length)
            {
                string nextTrimmed = lines[i + 1].Trim();
                if (nextTrimmed.StartsWith('|'))
                    result.Add(string.Empty);
            }
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

    internal static bool IsPipeTableRow(string line)
    {
        if (IsPipeTableSeparator(line))
            return false;

        string trimmed = line.Trim();
        if (trimmed.Length == 0)
            return false;

        if (trimmed.StartsWith('<') || trimmed.Contains("<table", StringComparison.OrdinalIgnoreCase))
            return false;

        if (trimmed.StartsWith("```", StringComparison.Ordinal))
            return false;

        if (!trimmed.StartsWith('|') || !trimmed.EndsWith('|'))
            return false;

        return trimmed.Count(c => c == '|') >= 2;
    }

    internal static bool IsPipeTableSeparator(string line)
    {
        string trimmed = line.Trim();
        if (!trimmed.Contains('|'))
            return false;

        if (!Regex.IsMatch(
                trimmed,
                @"^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$"))
            return false;

        // 구분선 셀만 있는지 확인합니다. "| :--- |" 형태의 정렬 구분선도 포함합니다.
        foreach (string cell in trimmed.Trim('|').Split('|'))
        {
            if (!Regex.IsMatch(cell.Trim(), @"^:?-{3,}:?$"))
                return false;
        }

        return true;
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
