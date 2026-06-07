using System.Text;

namespace CodeAnalyzer.Services;

public static class AnalysisExportFileNameBuilder
{
    private const string FilePrefix = "CodeAnalyzer-";
    private const int MaxDirectoryTokenLength = 48;

    public static string Build(string? rootDirectory, string extension)
    {
        var directoryToken = ExtractDirectoryToken(rootDirectory);
        var normalizedExtension = extension.Trim().TrimStart('.');
        var timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
        return $"{FilePrefix}{directoryToken}_{timestamp}.{normalizedExtension}";
    }

    public static string ExtractDirectoryToken(string? rootDirectory)
    {
        if (string.IsNullOrWhiteSpace(rootDirectory))
        {
            return "Project";
        }

        var trimmed = rootDirectory.Trim().TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var name = Path.GetFileName(trimmed);
        if (string.IsNullOrWhiteSpace(name))
        {
            var root = Path.GetPathRoot(trimmed);
            name = string.IsNullOrWhiteSpace(root)
                ? "Root"
                : root.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        }

        return SanitizeFileNameToken(name);
    }

    public static string SanitizeFileNameToken(string token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return "Project";
        }

        var invalid = Path.GetInvalidFileNameChars().ToHashSet();
        var builder = new StringBuilder(token.Length);
        foreach (var ch in token)
        {
            builder.Append(invalid.Contains(ch) ? '_' : ch);
        }

        var sanitized = CollapseUnderscores(builder.ToString().Trim().Trim('_', '.', ' '));
        if (sanitized.Length > MaxDirectoryTokenLength)
        {
            sanitized = sanitized[..MaxDirectoryTokenLength].TrimEnd('_');
        }

        return string.IsNullOrWhiteSpace(sanitized) ? "Project" : sanitized;
    }

    private static string CollapseUnderscores(string value)
    {
        var builder = new StringBuilder(value.Length);
        var previousWasUnderscore = false;
        foreach (var ch in value)
        {
            if (ch == '_')
            {
                if (previousWasUnderscore)
                {
                    continue;
                }

                previousWasUnderscore = true;
                builder.Append('_');
                continue;
            }

            previousWasUnderscore = false;
            builder.Append(ch == ' ' ? '_' : ch);
        }

        return builder.ToString();
    }
}
