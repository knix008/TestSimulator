using System.Text.Json;

namespace RemoteDesktopWinV10.App;

public static class UiSettingsStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public static string SettingsFilePath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "RemoteDesktopWinV10",
        "ui.json");

    public static UiSettings Load()
    {
        try
        {
            if (!File.Exists(SettingsFilePath))
            {
                return new UiSettings();
            }

            var json = File.ReadAllText(SettingsFilePath);
            return JsonSerializer.Deserialize<UiSettings>(json, JsonOptions) ?? new UiSettings();
        }
        catch
        {
            return new UiSettings();
        }
    }

    public static void Save(UiSettings settings)
    {
        var dir = Path.GetDirectoryName(SettingsFilePath);
        if (!string.IsNullOrEmpty(dir))
        {
            Directory.CreateDirectory(dir);
        }

        var json = JsonSerializer.Serialize(settings, JsonOptions);
        var tmp = SettingsFilePath + ".tmp";
        File.WriteAllText(tmp, json);
        File.Copy(tmp, SettingsFilePath, overwrite: true);
        File.Delete(tmp);
    }
}
