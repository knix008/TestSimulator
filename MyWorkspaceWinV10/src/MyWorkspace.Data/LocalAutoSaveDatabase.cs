using MyWorkspace.Core.Enums;
using MyWorkspace.Core.Models;

namespace MyWorkspace.Data;

public static class LocalAutoSaveDatabase
{
    private static readonly object Gate = new();
    private static AppServices? _services;

    public static DatabaseSettings Settings { get; } = CreateSettings();

    public static AppServices GetServices()
    {
        lock (Gate)
        {
            _services ??= new AppServices(Settings, new EmailSettings());
            return _services;
        }
    }

    public static bool IsSameDatabaseFile(DatabaseSettings settings)
    {
        if (settings.Provider != DatabaseProviderType.SQLite)
            return false;

        var primaryPath = NormalizePath(settings.SqliteFilePath);
        var autoSavePath = NormalizePath(Settings.SqliteFilePath);
        return string.Equals(primaryPath, autoSavePath, StringComparison.OrdinalIgnoreCase);
    }

    private static DatabaseSettings CreateSettings() =>
        DatabaseSettings.CreateDefault(DatabaseProviderType.SQLite);

    private static string NormalizePath(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
            path = DatabaseSettings.GetDefaultSqlitePath();

        return Path.GetFullPath(path.Trim());
    }
}
