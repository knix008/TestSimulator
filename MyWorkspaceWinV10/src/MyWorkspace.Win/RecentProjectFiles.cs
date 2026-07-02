namespace MyWorkspace.Win;

internal static class RecentProjectFiles
{
    public const int MaxCount = 12;

    public static IReadOnlyList<string> GetPaths() =>
        AppConfig.UiSettings.RecentProjectPaths
            .Where(static path => !string.IsNullOrWhiteSpace(path))
            .ToList();

    public static void Record(string? path)
    {
        var normalized = NormalizePath(path);
        if (normalized == null)
            return;

        var settings = AppConfig.UiSettings.Clone();
        settings.RecentProjectPaths.RemoveAll(existing =>
            string.Equals(existing, normalized, StringComparison.OrdinalIgnoreCase));
        settings.RecentProjectPaths.Insert(0, normalized);

        if (settings.RecentProjectPaths.Count > MaxCount)
            settings.RecentProjectPaths.RemoveRange(MaxCount, settings.RecentProjectPaths.Count - MaxCount);

        AppConfig.SaveUiSettings(settings);
    }

    public static void Remove(string? path)
    {
        var normalized = NormalizePath(path);
        if (normalized == null)
            return;

        var settings = AppConfig.UiSettings.Clone();
        var removed = settings.RecentProjectPaths.RemoveAll(existing =>
            string.Equals(existing, normalized, StringComparison.OrdinalIgnoreCase));
        if (removed == 0)
            return;

        AppConfig.SaveUiSettings(settings);
    }

    public static void Clear()
    {
        var settings = AppConfig.UiSettings.Clone();
        if (settings.RecentProjectPaths.Count == 0)
            return;

        settings.RecentProjectPaths.Clear();
        AppConfig.SaveUiSettings(settings);
    }

    public static string GetDisplayName(string path, IReadOnlyList<string> allPaths)
    {
        var fileName = Path.GetFileName(path);
        if (string.IsNullOrWhiteSpace(fileName))
            return path;

        var hasDuplicateName = allPaths.Any(other =>
            !string.Equals(other, path, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(Path.GetFileName(other), fileName, StringComparison.OrdinalIgnoreCase));

        if (!hasDuplicateName)
            return fileName;

        var directoryName = Path.GetFileName(Path.GetDirectoryName(path) ?? string.Empty);
        return string.IsNullOrWhiteSpace(directoryName)
            ? fileName
            : $"{fileName} ({directoryName})";
    }

    private static string? NormalizePath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
            return null;

        if (!path.EndsWith(".wsp", StringComparison.OrdinalIgnoreCase))
            return null;

        try
        {
            return Path.GetFullPath(path.Trim());
        }
        catch
        {
            return path.Trim();
        }
    }
}
