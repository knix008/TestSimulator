using System.Text.RegularExpressions;

namespace CodeAnalyzer.Services.Duplicates;

internal static class LineNormalizer
{
    private static readonly Regex WhitespaceRegex = new(@"\s+", RegexOptions.Compiled);

    public static string Normalize(string line)
    {
        var trimmed = line.TrimEnd('\r', '\n');
        trimmed = StripTrailingComment(trimmed).Trim();
        if (trimmed.Length == 0)
        {
            return string.Empty;
        }

        return WhitespaceRegex.Replace(trimmed, " ");
    }

    public static bool IsSignificantLine(string normalizedLine)
    {
        if (string.IsNullOrWhiteSpace(normalizedLine))
        {
            return false;
        }

        return normalizedLine is not ("{" or "}" or "};" or "(" or ")" or "[" or "]" or "break;" or "continue;");
    }

    private static string StripTrailingComment(string line)
    {
        var slash = line.IndexOf("//", StringComparison.Ordinal);
        if (slash < 0)
        {
            return line;
        }

        if (slash > 0 && line[slash - 1] == ':')
        {
            return line;
        }

        return line[..slash];
    }
}
