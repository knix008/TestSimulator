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
    public string CharSet { get; set; } = "Standard";
    public string CustomChars { get; set; } = "@#*+:. ";
    public string FontName { get; set; } = "Consolas";
    public float FontSize { get; set; } = 4.0f;
    public bool ColorOutput { get; set; } = false;
    public bool InvertBrightness { get; set; } = false;
    public bool EdgeDetect { get; set; } = false;
    public int Contrast { get; set; } = 0;
    public int Brightness { get; set; } = 0;
    public int SplitterDistance { get; set; } = 430;

    public static AppSettings Load()
    {
        try
        {
            if (File.Exists(SettingsPath))
            {
                var json = File.ReadAllText(SettingsPath);
                return JsonSerializer.Deserialize<AppSettings>(json) ?? new AppSettings();
            }
        }
        catch { }
        return new AppSettings();
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
}
