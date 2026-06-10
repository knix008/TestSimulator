using System.IO;
using System.Text.Json;

namespace MyClockWinV10.Models;

public static class ScreensaverSettingsManager
{
    private static readonly string Path = System.IO.Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "MyClock", "screensaver.json");

    private static readonly JsonSerializerOptions Opts = new() { WriteIndented = true };

    public static ScreensaverSettings Load()
    {
        try
        {
            if (File.Exists(Path))
                return JsonSerializer.Deserialize<ScreensaverSettings>(File.ReadAllText(Path), Opts)
                       ?? CreateDefaults();
        }
        catch { }
        return CreateDefaults();
    }

    public static void Save(ScreensaverSettings settings)
    {
        try
        {
            Directory.CreateDirectory(System.IO.Path.GetDirectoryName(Path)!);
            File.WriteAllText(Path, JsonSerializer.Serialize(settings, Opts));
        }
        catch { }
    }

    public static ScreensaverSettings Resolve(ScreensaverSettings saved)
    {
        if (!saved.UseAppSettings) return saved;

        var app = SettingsManager.Load();
        return new ScreensaverSettings
        {
            IsDigital        = saved.IsDigital,
            ClockSizePercent = saved.ClockSizePercent,
            UseAppSettings   = true,
            Theme            = app.Theme,
            DigitalStyleName = app.DigitalStyleName,
            AnalogStyleName  = app.AnalogStyleName,
            Use24h           = app.Use24h,
            DigitColor       = app.DigitColor,
            AmPmColor        = app.AmPmColor
        };
    }

    private static ScreensaverSettings CreateDefaults()
    {
        var app = SettingsManager.Load();
        return new ScreensaverSettings
        {
            IsDigital        = app.IsDigital,
            ClockSizePercent = 40,
            UseAppSettings   = true,
            Theme            = app.Theme,
            DigitalStyleName = app.DigitalStyleName,
            AnalogStyleName  = app.AnalogStyleName,
            Use24h           = app.Use24h,
            DigitColor       = app.DigitColor,
            AmPmColor        = app.AmPmColor
        };
    }
}
