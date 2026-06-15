using System.Text.Json;

namespace MyAgileBoardWinV10.Services;

public static class AppSettings
{
    private static string? _lastDirectory;
    private static bool _loaded;

    private static string SettingsPath =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "MyAgileBoard",
            "settings.json");

    public static string GetLastDirectory()
    {
        EnsureLoaded();
        return _lastDirectory ?? string.Empty;
    }

    public static void SetLastDirectory(string directory)
    {
        if (string.IsNullOrWhiteSpace(directory) || !Directory.Exists(directory))
            return;

        EnsureLoaded();
        if (_lastDirectory == directory) return;

        _lastDirectory = directory;
        Save();
    }

    private static void EnsureLoaded()
    {
        if (_loaded) return;
        _loaded = true;

        try
        {
            if (!File.Exists(SettingsPath)) return;
            using var doc = JsonDocument.Parse(File.ReadAllText(SettingsPath));
            if (doc.RootElement.TryGetProperty("lastDirectory", out var prop))
                _lastDirectory = prop.GetString();
        }
        catch { /* 손상된 설정 파일은 무시 */ }
    }

    private static void Save()
    {
        try
        {
            var dir = Path.GetDirectoryName(SettingsPath)!;
            Directory.CreateDirectory(dir);
            var json = JsonSerializer.Serialize(new { lastDirectory = _lastDirectory });
            File.WriteAllText(SettingsPath, json);
        }
        catch { /* 설정 저장 실패 시 무시 */ }
    }
}
