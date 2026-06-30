namespace MyWorkspace.Win;

internal static class PageDocumentBuilder
{
    public static string BuildMarkdownFile(string title, string markdownBody, bool includeFrontMatter = true)
    {
        var body = markdownBody.Trim();
        if (!includeFrontMatter)
            return body;

        var safeTitle = title.Trim();
        if (string.IsNullOrEmpty(safeTitle))
            safeTitle = Localization.Get(K.UntitledPageTitle);

        return $"""
            ---
            title: {EscapeYamlScalar(safeTitle)}
            ---

            {body}
            """.TrimStart();
    }

    public static string SanitizeFileName(string title)
    {
        var trimmed = title.Trim();
        if (string.IsNullOrEmpty(trimmed))
            trimmed = Localization.Get(K.UntitledPageTitle);

        foreach (var invalid in Path.GetInvalidFileNameChars())
            trimmed = trimmed.Replace(invalid, '_');

        trimmed = trimmed.Trim().TrimEnd('.');
        return string.IsNullOrWhiteSpace(trimmed) ? "page" : trimmed;
    }

    private static string EscapeYamlScalar(string value)
    {
        if (value.Contains(':', StringComparison.Ordinal) ||
            value.Contains('#', StringComparison.Ordinal) ||
            value.Contains('"', StringComparison.Ordinal) ||
            value.Contains('\'', StringComparison.Ordinal))
        {
            return $"\"{value.Replace("\\", "\\\\").Replace("\"", "\\\"")}\"";
        }

        return value;
    }
}
