using System.Text.Json;

namespace FileMasterWinV10.Helpers;

public enum AppLanguage
{
    Korean,
    English
}

public enum AppTheme
{
    Light,
    Dark
}

public sealed class AppPreferences
{
    private readonly string _filePath;

    public AppLanguage Language { get; set; } = AppLanguage.Korean;
    public AppTheme Theme { get; set; } = AppTheme.Light;

    public AppPreferences()
    {
        string dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            AppInfo.AppDataFolderName);
        Directory.CreateDirectory(dir);
        _filePath = Path.Combine(dir, "preferences.json");
    }

    public void Load()
    {
        if (!File.Exists(_filePath)) return;

        try
        {
            var data = JsonSerializer.Deserialize<PreferenceData>(File.ReadAllText(_filePath));
            if (data == null) return;

            if (Enum.TryParse<AppLanguage>(data.Language, ignoreCase: true, out var language))
                Language = language;
            if (Enum.TryParse<AppTheme>(data.Theme, ignoreCase: true, out var theme))
                Theme = theme;
        }
        catch
        {
            // Ignore corrupt preferences and keep defaults.
        }
    }

    public void Save()
    {
        var data = new PreferenceData
        {
            Language = Language.ToString(),
            Theme = Theme.ToString(),
        };

        File.WriteAllText(_filePath, JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = true }));
    }

    private sealed class PreferenceData
    {
        public string? Language { get; set; }
        public string? Theme { get; set; }
    }
}