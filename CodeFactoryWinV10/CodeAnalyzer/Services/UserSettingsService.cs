using System.Text.Json;

namespace CodeAnalyzer.Services;

public sealed class UserSettingsService
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    private readonly string _settingsFilePath;

    public UserSettingsService()
    {
        var settingsDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "CodeAnalyzer");

        Directory.CreateDirectory(settingsDirectory);
        _settingsFilePath = Path.Combine(settingsDirectory, "settings.json");
    }

    public string? LoadLastRootDirectory()
    {
        if (!File.Exists(_settingsFilePath))
        {
            return null;
        }

        try
        {
            var json = File.ReadAllText(_settingsFilePath);
            var settings = JsonSerializer.Deserialize<UserSettings>(json);
            var path = settings?.LastRootDirectory;

            return !string.IsNullOrWhiteSpace(path) && Directory.Exists(path) ? path : null;
        }
        catch
        {
            return null;
        }
    }

    public void SaveLastRootDirectory(string rootDirectory)
    {
        if (string.IsNullOrWhiteSpace(rootDirectory) || !Directory.Exists(rootDirectory))
        {
            return;
        }

        try
        {
            var settings = new UserSettings
            {
                LastRootDirectory = Path.GetFullPath(rootDirectory)
            };

            var json = JsonSerializer.Serialize(settings, JsonOptions);
            File.WriteAllText(_settingsFilePath, json);
        }
        catch
        {
            // 설정 저장 실패는 분석 기능에 영향을 주지 않도록 무시합니다.
        }
    }

    private sealed class UserSettings
    {
        public string? LastRootDirectory { get; set; }
    }
}
