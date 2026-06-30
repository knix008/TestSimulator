namespace MyWorkspace.Win;

internal static class DialogPathHelper
{
    public static void ApplyExportDirectory(FileDialog dialog)
    {
        var directory = AppConfig.UiSettings.LastExportDirectory;
        if (IsExistingDirectory(directory))
            dialog.InitialDirectory = directory;
    }

    public static void ApplyOpenDirectory(FileDialog dialog)
    {
        var directory = AppConfig.UiSettings.LastOpenDirectory;
        if (IsExistingDirectory(directory))
            dialog.InitialDirectory = directory;
    }

    public static void ApplyExportDirectory(FolderBrowserDialog dialog)
    {
        var directory = AppConfig.UiSettings.LastExportDirectory;
        if (IsExistingDirectory(directory))
            dialog.SelectedPath = directory;
    }

    public static void RememberExportPath(string? path)
    {
        var directory = ResolveDirectory(path);
        if (directory == null)
            return;

        var settings = AppConfig.UiSettings.Clone();
        if (string.Equals(settings.LastExportDirectory, directory, StringComparison.OrdinalIgnoreCase))
            return;

        settings.LastExportDirectory = directory;
        AppConfig.SaveUiSettings(settings);
    }

    public static void RememberOpenPath(string? path)
    {
        var directory = ResolveDirectory(path);
        if (directory == null)
            return;

        var settings = AppConfig.UiSettings.Clone();
        if (string.Equals(settings.LastOpenDirectory, directory, StringComparison.OrdinalIgnoreCase))
            return;

        settings.LastOpenDirectory = directory;
        AppConfig.SaveUiSettings(settings);
    }

    internal static string? ResolveDirectory(string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
            return null;

        if (Directory.Exists(path))
            return path;

        var directory = Path.GetDirectoryName(path);
        return IsExistingDirectory(directory) ? directory : null;
    }

    private static bool IsExistingDirectory(string? path) =>
        !string.IsNullOrWhiteSpace(path) && Directory.Exists(path);
}
