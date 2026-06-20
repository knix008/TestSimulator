using System.Text.Json;

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
}
