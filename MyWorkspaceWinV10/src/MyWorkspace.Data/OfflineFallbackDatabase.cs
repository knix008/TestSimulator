using MyWorkspace.Core.Enums;
using MyWorkspace.Core.Models;

namespace MyWorkspace.Data;

public static class OfflineFallbackDatabase
{
    private static readonly object Gate = new();
    private static AppServices? _services;

    public static DatabaseSettings Settings { get; } = CreateSettings();

    public static string DatabasePath => Settings.SqliteFilePath;

    public static AppServices GetServices()
    {
        lock (Gate)
        {
            if (_services == null)
                _services = CreateServices();

            return _services;
        }
    }

    public static bool IsSameDatabaseFile(DatabaseSettings settings)
    {
        if (settings.Provider != DatabaseProviderType.SQLite)
            return false;

        var primaryPath = NormalizePath(settings.SqliteFilePath);
        var offlinePath = NormalizePath(Settings.SqliteFilePath);
        return string.Equals(primaryPath, offlinePath, StringComparison.OrdinalIgnoreCase);
    }

    public static bool IsPrimaryAvailable(DatabaseSettings settings)
    {
        if (IsSameDatabaseFile(settings))
            return false;

        return DatabaseContextFactory.TestConnection(settings, out _);
    }

    private static AppServices CreateServices()
    {
        var services = new AppServices(Settings, new EmailSettings());
        return services;
    }

    private static DatabaseSettings CreateSettings()
    {
        var directory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "MyWorkspaceWinV10");
        Directory.CreateDirectory(directory);

        return new DatabaseSettings
        {
            Provider = DatabaseProviderType.SQLite,
            SqliteFilePath = Path.Combine(directory, "offline-fallback.db")
        };
    }

    private static string NormalizePath(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
            path = DatabaseSettings.GetDefaultSqlitePath();

        return Path.GetFullPath(path.Trim());
    }
}
