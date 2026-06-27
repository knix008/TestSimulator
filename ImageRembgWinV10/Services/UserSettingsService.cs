using System.Text.Json;
using ImageRembgWinV10.Localization;

namespace ImageRembgWinV10.Services;

internal static class UserSettingsService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true
    };

    private static readonly string SettingsDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "ImageRembgWinV10");

    private static readonly string SettingsPath = Path.Combine(SettingsDirectory, "settings.json");

    private static UserSettings _settings = new();

    public static OutputSizeMode OutputSizeMode
    {
        get => _settings.OutputSizeMode;
        set
        {
            if (_settings.OutputSizeMode == value)
            {
                return;
            }

            _settings.OutputSizeMode = value;
            Save();
        }
    }

    public static AppLanguage Language
    {
        get => _settings.Language;
        set
        {
            if (_settings.Language == value)
            {
                return;
            }

            _settings.Language = value;
            Save();
        }
    }

    public static void Load()
    {
        try
        {
            if (!File.Exists(SettingsPath))
            {
                return;
            }

            var json = File.ReadAllText(SettingsPath);
            _settings = JsonSerializer.Deserialize<UserSettings>(json) ?? new UserSettings();
        }
        catch
        {
            _settings = new UserSettings();
        }
    }

    public static string? GetInitialDirectory()
    {
        var directory = _settings.LastDirectory;
        return !string.IsNullOrWhiteSpace(directory) && Directory.Exists(directory)
            ? directory
            : null;
    }

    public static void RememberPath(string? fileOrDirectoryPath)
    {
        var directory = ResolveDirectory(fileOrDirectoryPath);
        if (directory == null)
        {
            return;
        }

        if (string.Equals(_settings.LastDirectory, directory, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        _settings.LastDirectory = directory;
        Save();
    }

    private static string? ResolveDirectory(string? fileOrDirectoryPath)
    {
        if (string.IsNullOrWhiteSpace(fileOrDirectoryPath))
        {
            return null;
        }

        if (Directory.Exists(fileOrDirectoryPath))
        {
            return Path.GetFullPath(fileOrDirectoryPath);
        }

        var directory = Path.GetDirectoryName(fileOrDirectoryPath);
        return !string.IsNullOrWhiteSpace(directory) && Directory.Exists(directory)
            ? Path.GetFullPath(directory)
            : null;
    }

    private static void Save()
    {
        try
        {
            Directory.CreateDirectory(SettingsDirectory);
            var json = JsonSerializer.Serialize(_settings, JsonOptions);
            File.WriteAllText(SettingsPath, json);
        }
        catch
        {
            // Settings persistence should not block normal app usage.
        }
    }

    private sealed class UserSettings
    {
        public string? LastDirectory { get; set; }

        public OutputSizeMode OutputSizeMode { get; set; } = OutputSizeMode.SelectionCrop;

        public AppLanguage Language { get; set; } = AppLanguage.Korean;
    }
}
