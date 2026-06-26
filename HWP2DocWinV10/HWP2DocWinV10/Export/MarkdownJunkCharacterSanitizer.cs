using System.Text;
using System.Text.RegularExpressions;

namespace HWP2DocWinV10.Export;

/// <summary>
/// HWP/unhwp 변환 Markdown에서 의미 없는 제어·장식·플레이스홀더 문자를 제거합니다.
/// </summary>
internal static class MarkdownJunkCharacterSanitizer
{
    private static readonly Regex HtmlSpaceEntityRegex = new(
        @"&(?:nbsp|#160|#x0*A0);",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex PlaceholderOnlyLineRegex = new(
        @"^\s*(?:[\u25A0-\u25A3\u25A1\u25CB\u25CF\u2610-\u2612\u25C6-\u25C7\u25BA\u25B6\u25AA\u25AB\u25E6\u2022\u00B7\u2219\u25C9\u25CE\u3007\u25C8\u25C9◻◼▢▣■□○●◇◆▷▶▪▫◦·•∙]|\uFFFC|\uFFFD)+\s*$",
        RegexOptions.Compiled);

    public static string Sanitize(string markdown)
    {
        if (string.IsNullOrEmpty(markdown))
            return string.Empty;

        string text = markdown.Replace("\r\n", "\n").Replace('\r', '\n');
        text = HtmlSpaceEntityRegex.Replace(text, " ");
        text = SanitizeCharacters(text);
        text = RemovePlaceholderOnlyLines(text);
        return text;
    }

    private static string SanitizeCharacters(string text)
    {
        var builder = new StringBuilder(text.Length);

        foreach (char c in text)
        {
            if (ShouldRemove(c))
                continue;

            builder.Append(ShouldNormalizeToSpace(c) ? ' ' : c);
        }

        return builder.ToString();
    }

    private static bool ShouldRemove(char c) => c switch
    {
        >= '\u0000' and <= '\u0008' => true,
        '\u000B' or '\u000C' => true,
        >= '\u000E' and <= '\u001F' => true,
        '\u007F' => true,
        '\u00AD' => true,
        '\u034F' => true,
        '\u061C' => true,
        '\u115F' or '\u1160' => true,
        '\u17B4' or '\u17B5' => true,
        '\u180E' => true,
        '\u200B' or '\u200C' or '\u200D' or '\u200E' or '\u200F' => true,
        >= '\u202A' and <= '\u202E' => true,
        '\u2060' or '\u2061' or '\u2062' or '\u2063' or '\u2064' => true,
        >= '\u206A' and <= '\u206F' => true,
        '\u3164' => true,
        '\uFEFF' => true,
        '\uFFA0' => true,
        '\uFFFC' or '\uFFFD' => true,
        >= '\uFFF0' and <= '\uFFFB' => true,
        >= '\uE000' and <= '\uF8FF' => true,
        _ => false
    };

    private static bool ShouldNormalizeToSpace(char c) => c switch
    {
        '\u00A0' => true,
        '\u1680' => true,
        >= '\u2000' and <= '\u200A' => true,
        '\u202F' => true,
        '\u205F' => true,
        '\u3000' => true,
        _ => false
    };

    private static string RemovePlaceholderOnlyLines(string text)
    {
        var lines = text.Split('\n');
        var result = new List<string>(lines.Length);

        foreach (string line in lines)
        {
            if (PlaceholderOnlyLineRegex.IsMatch(line))
                continue;

            string trimmedEnd = TrimTrailingInvisibleSpaces(line);
            if (trimmedEnd.Length == 0 && line.Length > 0 && !IsPreservedEmptyContext(result))
                continue;

            result.Add(trimmedEnd);
        }

        return string.Join('\n', result);
    }

    private static string TrimTrailingInvisibleSpaces(string line)
    {
        int end = line.Length;
        while (end > 0 && (line[end - 1] == ' ' || line[end - 1] == '\t'))
            end--;

        return end == line.Length ? line : line[..end];
    }

    private static bool IsPreservedEmptyContext(IReadOnlyList<string> result)
    {
        if (result.Count == 0)
            return true;

        string previous = result[^1].Trim();
        return previous.Length == 0 ||
               previous.StartsWith('|') ||
               previous.StartsWith("```", StringComparison.Ordinal);
    }
}
