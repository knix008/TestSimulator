using System.Text.Json;

namespace Image2TextWin;

public class AppSettings
{
    private static readonly string SettingsPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "Image2TextWin", "settings.json");

    public string LastImageDirectory { get; set; } = Environment.GetFolderPath(Environment.SpecialFolder.MyPictures);
    public string LastTextDirectory { get; set; } = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
    public string LastExportDirectory { get; set; } = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
    public int OutputWidth { get; set; } = 120;
    public int OutputHeight { get; set; } = 60;
    public bool AutoHeight { get; set; } = true;
    public float AspectRatio { get; set; } = 0.45f;
    public bool KeepAspectRatio { get; set; } = false;
    public bool AutoWidth { get; set; } = true;
    public int OutputScale { get; set; } = 50;
    public string CharSet { get; set; } = "Standard";
    public string CustomChars { get; set; } = "@#*+:. ";
    public string FontName { get; set; } = "Consolas";
    public float FontSize { get; set; } = 4.0f;
    public bool ColorOutput { get; set; } = false;
    public bool InvertBrightness { get; set; } = false;
    public bool EdgeDetect { get; set; } = false;
    public int Contrast { get; set; } = 50;
    public int Brightness { get; set; } = 50;
    public int SplitterDistance { get; set; } = 430;
    // SettingsVersion 0 = pre-v1.1 (Contrast/Brightness were -100..100, 0=neutral)
    // SettingsVersion 1 = v1.1 (migration attempted but defaulted to 1, may still have old values)
    // SettingsVersion 2 = v1.2+ (Contrast/Brightness are 0..100, 50=neutral, confirmed correct)
    // Default must be 0 so JSON files without this field trigger migration
    public int SettingsVersion { get; set; } = 0;

    public static AppSettings Load()
    {
        AppSettings s;
        try
        {
            if (File.Exists(SettingsPath))
            {
                var json = File.ReadAllText(SettingsPath);
                s = JsonSerializer.Deserialize<AppSettings>(json) ?? new AppSettings();
            }
            else
            {
                s = new AppSettings();
            }
        }
        catch { s = new AppSettings(); }

        // Migrate: versions 0 and 1 may have Contrast/Brightness in old -100..100 format (0=neutral)
        // New format is 0..100 (50=neutral). Version 1 had a bug where migration could be skipped.
        if (s.SettingsVersion < 2)
        {
            if (s.Contrast < 0 || s.Contrast > 100)
                s.Contrast = Math.Clamp(s.Contrast / 2 + 50, 0, 100);
            else if (s.Contrast == 0)
                s.Contrast = 50;
            if (s.Brightness < 0 || s.Brightness > 100)
                s.Brightness = Math.Clamp(s.Brightness / 2 + 50, 0, 100);
            else if (s.Brightness == 0)
                s.Brightness = 50;
            s.SettingsVersion = 2;
        }
        return s;
    }

    public void Save()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(SettingsPath)!);
            var json = JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(SettingsPath, json);
        }
        catch { }
    }

    // ── 프리셋 저장/불러오기 ────────────────────────────────────────────────

    public static readonly JsonSerializerOptions PresetJsonOptions =
        new() { WriteIndented = true };

    public void SavePreset(string path)
    {
        var preset = new ConversionPreset
        {
            OutputWidth    = OutputWidth,
            OutputHeight   = OutputHeight,
            AutoHeight     = AutoHeight,
            AspectRatio    = AspectRatio,
            KeepAspectRatio = KeepAspectRatio,
            AutoWidth      = AutoWidth,
            OutputScale  = OutputScale,
            CharSet      = CharSet,
            CustomChars  = CustomChars,
            FontName     = FontName,
            FontSize     = FontSize,
            ColorOutput  = ColorOutput,
            InvertBrightness = InvertBrightness,
            EdgeDetect   = EdgeDetect,
            Contrast     = Contrast,
            Brightness   = Brightness
        };
        var json = JsonSerializer.Serialize(preset, PresetJsonOptions);
        File.WriteAllText(path, json, System.Text.Encoding.UTF8);
    }

    public void LoadPreset(string path)
    {
        var json = File.ReadAllText(path, System.Text.Encoding.UTF8);
        var preset = JsonSerializer.Deserialize<ConversionPreset>(json);
        if (preset == null) throw new InvalidDataException("프리셋 파일을 읽을 수 없습니다.");

        OutputWidth      = preset.OutputWidth;
        OutputHeight     = preset.OutputHeight;
        AutoHeight       = preset.AutoHeight;
        AspectRatio      = preset.AspectRatio;
        KeepAspectRatio  = preset.KeepAspectRatio;
        AutoWidth        = preset.AutoWidth;
        OutputScale      = preset.OutputScale;
        CharSet          = preset.CharSet;
        CustomChars      = preset.CustomChars;
        FontName         = preset.FontName;
        FontSize         = preset.FontSize;
        ColorOutput      = preset.ColorOutput;
        InvertBrightness = preset.InvertBrightness;
        EdgeDetect       = preset.EdgeDetect;
        Contrast         = preset.Contrast;
        Brightness       = preset.Brightness;
    }
}

public class ConversionPreset
{
    public int OutputWidth { get; set; } = 120;
    public int OutputHeight { get; set; } = 60;
    public bool AutoHeight { get; set; } = true;
    public float AspectRatio { get; set; } = 0.45f;
    public bool KeepAspectRatio { get; set; } = false;
    public bool AutoWidth { get; set; } = true;
    public int OutputScale { get; set; } = 50;
    public string CharSet { get; set; } = "Standard";
    public string CustomChars { get; set; } = "@#*+:. ";
    public string FontName { get; set; } = "Consolas";
    public float FontSize { get; set; } = 4.0f;
    public bool ColorOutput { get; set; } = false;
    public bool InvertBrightness { get; set; } = false;
    public bool EdgeDetect { get; set; } = false;
    public int Contrast { get; set; } = 50;
    public int Brightness { get; set; } = 50;
}
