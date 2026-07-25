using System.Text.Json;

namespace RTSPCall.Core.Services;

public static class SettingsStore
{
    private static readonly JsonSerializerOptions Options = new() { WriteIndented = true };

    public static T Load<T>(string appFolderName, Func<T> factory) where T : class
    {
        try
        {
            var path = GetPath(appFolderName);
            if (!File.Exists(path))
                return factory();
            var json = File.ReadAllText(path);
            return JsonSerializer.Deserialize<T>(json, Options) ?? factory();
        }
        catch
        {
            return factory();
        }
    }

    public static void Save<T>(string appFolderName, T settings)
    {
        var path = GetPath(appFolderName);
        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);
        File.WriteAllText(path, JsonSerializer.Serialize(settings, Options));
    }

    private static string GetPath(string appFolderName) =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            appFolderName,
            "settings.json");
}
