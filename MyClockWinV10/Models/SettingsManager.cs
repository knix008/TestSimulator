using System.Diagnostics;
using System.IO;
using System.Text.Json;
using Microsoft.Win32;

namespace MyClockWinV10.Models;

public static class SettingsManager
{
    private static readonly string _path = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "MyClock", "settings.json");

    private static readonly JsonSerializerOptions _opts = new() { WriteIndented = true };

    private const string RunKeyPath = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Run";
    private const string AppName    = "MyClock";

    public static AppSettings Load()
    {
        try
        {
            if (File.Exists(_path))
                return JsonSerializer.Deserialize<AppSettings>(File.ReadAllText(_path), _opts) ?? new();
        }
        catch { }
        return new();
    }

    public static void Save(AppSettings settings)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
            File.WriteAllText(_path, JsonSerializer.Serialize(settings, _opts));
        }
        catch { }
    }

    public static AppSettings Defaults() => new();

    // ── Startup registry ──────────────────────────────────────────────────

    public static bool IsStartupEnabled()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, false);
            return key?.GetValue(AppName) != null;
        }
        catch { return false; }
    }

    public static void SetStartup(bool enable)
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, true);
            if (key == null) return;
            if (enable)
            {
                string exe = Process.GetCurrentProcess().MainModule!.FileName;
                key.SetValue(AppName, $"\"{exe}\"");
            }
            else
            {
                key.DeleteValue(AppName, false);
            }
        }
        catch { }
    }
}
