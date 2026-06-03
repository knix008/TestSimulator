namespace CodeAnalyzer.Services.Metrics;

internal static class SourceLineCounter
{
    public static (int Physical, int Code, int Blank) Count(string content)
    {
        if (string.IsNullOrEmpty(content))
        {
            return (0, 0, 0);
        }

        var physical = 0;
        var code = 0;
        var blank = 0;
        var inBlockComment = false;

        foreach (var line in content.Split('\n'))
        {
            physical++;
            var trimmed = line.TrimEnd('\r');

            if (string.IsNullOrWhiteSpace(trimmed))
            {
                blank++;
                continue;
            }

            var work = trimmed;
            if (inBlockComment)
            {
                var end = work.IndexOf("*/", StringComparison.Ordinal);
                if (end < 0)
                {
                    continue;
                }

                inBlockComment = false;
                work = work[(end + 2)..].TrimStart();
                if (work.Length == 0)
                {
                    continue;
                }
            }

            if (TryStripLeadingComments(ref work, ref inBlockComment) && work.Length > 0)
            {
                code++;
            }
        }

        return (physical, code, blank);
    }

    private static bool TryStripLeadingComments(ref string line, ref bool inBlockComment)
    {
        while (line.Length > 0)
        {
            if (inBlockComment)
            {
                var end = line.IndexOf("*/", StringComparison.Ordinal);
                if (end < 0)
                {
                    line = string.Empty;
                    return false;
                }

                inBlockComment = false;
                line = line[(end + 2)..].TrimStart();
                continue;
            }

            if (line.StartsWith("//", StringComparison.Ordinal)
                || line.StartsWith("#", StringComparison.Ordinal)
                || line.StartsWith(";", StringComparison.Ordinal))
            {
                return false;
            }

            if (line.StartsWith("/*", StringComparison.Ordinal))
            {
                var end = line.IndexOf("*/", 2, StringComparison.Ordinal);
                if (end < 0)
                {
                    inBlockComment = true;
                    return false;
                }

                line = line[(end + 2)..].TrimStart();
                continue;
            }

            return true;
        }

        return false;
    }
}
