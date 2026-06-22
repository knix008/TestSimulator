using System.Text.Json;
using ReqTrace.Persistence.Database;

namespace ReqTrace.Persistence;

public static class AppSettingsService
{
    private const int MaxRecentFiles = 10;

    private static string SettingsFilePath
    {
        get
        {
            var folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ReqTrace");
            Directory.CreateDirectory(folder);
            return Path.Combine(folder, "settings.json");
        }
    }

    public static AppSettings Load()
    {
        try
        {
            if (!File.Exists(SettingsFilePath))
                return new AppSettings();

            var json = File.ReadAllText(SettingsFilePath);
            return JsonSerializer.Deserialize<AppSettings>(json, JsonSerializationSettings.Default) ?? new AppSettings();
        }
        catch
        {
            return new AppSettings();
        }
    }

    public static void Save(AppSettings settings)
    {
        var json = JsonSerializer.Serialize(settings, JsonSerializationSettings.Default);
        File.WriteAllText(SettingsFilePath, json);
    }

    public static void AddRecentFile(AppSettings settings, string filePath)
    {
        settings.RecentFiles.RemoveAll(f => string.Equals(f, filePath, StringComparison.OrdinalIgnoreCase));
        settings.RecentFiles.Insert(0, filePath);
        if (settings.RecentFiles.Count > MaxRecentFiles)
            settings.RecentFiles.RemoveRange(MaxRecentFiles, settings.RecentFiles.Count - MaxRecentFiles);
    }

    public static void SetLastProjectPath(AppSettings settings, string? filePath)
    {
        settings.LastProjectPath = string.IsNullOrWhiteSpace(filePath) ? string.Empty : filePath;
    }

    public static DbConnectionSettings? LoadDbConnectionSettings(AppSettings settings)
    {
        if (!settings.DbConnectionConfigured)
            return null;

        return new DbConnectionSettings
        {
            Provider = settings.DbProvider,
            Server = settings.DbServer,
            Port = settings.DbPort,
            Database = settings.DbDatabase,
            Username = settings.DbUsername,
            Password = DbCredentialProtector.Unprotect(settings.DbPasswordProtected),
            IntegratedSecurity = settings.DbIntegratedSecurity,
            SqliteFilePath = settings.DbSqliteFilePath
        };
    }

    public static void SaveDbConnectionSettings(AppSettings settings, DbConnectionSettings dbSettings)
    {
        settings.DbProvider = dbSettings.Provider;
        settings.DbServer = dbSettings.Server;
        settings.DbPort = dbSettings.Port;
        settings.DbDatabase = dbSettings.Database;
        settings.DbUsername = dbSettings.Username;
        settings.DbPasswordProtected = DbCredentialProtector.Protect(dbSettings.Password);
        settings.DbIntegratedSecurity = dbSettings.IntegratedSecurity;
        settings.DbSqliteFilePath = dbSettings.SqliteFilePath;
        settings.DbConnectionConfigured = true;
    }
}
