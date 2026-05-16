using System.Text.Json;

namespace VNCServer.Settings;

public class ServerSettings
{
    public int Port { get; set; } = 5900;
    public string Password { get; set; } = string.Empty;
    public bool RequirePassword { get; set; } = true;
    public bool AllowMouseControl { get; set; } = true;  // 마우스는 기본 공유
    public bool AllowKeyboardControl { get; set; } = false;  // 키보드는 선택적 공유
    public bool AllowMultipleConnections { get; set; } = false;
    public int CompressionLevel { get; set; } = 6;
    public int FrameRate { get; set; } = 30;
    public bool AutoStart { get; set; } = false;
    public bool MinimizeToTray { get; set; } = true;

    private static string SettingsPath => 
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), 
                     "VNCServer", "settings.json");

    public static ServerSettings Load()
    {
        try
        {
            if (File.Exists(SettingsPath))
            {
                var json = File.ReadAllText(SettingsPath);
                return JsonSerializer.Deserialize<ServerSettings>(json) ?? new ServerSettings();
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Failed to load settings: {ex.Message}");
        }
        return new ServerSettings();
    }

    public void Save()
    {
        try
        {
            var directory = Path.GetDirectoryName(SettingsPath);
            if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
            {
                Directory.CreateDirectory(directory);
            }

            var json = JsonSerializer.Serialize(this, new JsonSerializerOptions 
            { 
                WriteIndented = true 
            });
            File.WriteAllText(SettingsPath, json);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Failed to save settings: {ex.Message}");
        }
    }
}
