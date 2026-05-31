using System.Text.Json;
using System.Text.Json.Serialization;
using OCRWinV10.Ocr;

namespace OCRWinV10;

public class AppSettings
{
    public string LastDirectory { get; set; } = "";
    public int PreprocessMode { get; set; } = 0;
    public string OcrProviderId { get; set; } = OcrProviderIds.PaddleKorean;

    public int OuterSplitterDistance { get; set; } = 420;
    public int InnerSplitterDistance { get; set; } = 597;
    public int WindowWidth { get; set; } = 1200;
    public int WindowHeight { get; set; } = 700;
    public int WindowX { get; set; } = -1;
    public int WindowY { get; set; } = -1;
    public FormWindowState WindowState { get; set; } = FormWindowState.Normal;
}

public static class SettingsManager
{
    private static readonly string SettingsDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "OCRWinV10");

    private static readonly string SettingsPath = Path.Combine(SettingsDir, "settings.json");

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Converters = { new JsonStringEnumConverter() }
    };

    public static AppSettings Load()
    {
        try
        {
            if (!File.Exists(SettingsPath))
                return new AppSettings();

            var json = File.ReadAllText(SettingsPath);
            return JsonSerializer.Deserialize<AppSettings>(json, JsonOptions) ?? new AppSettings();
        }
        catch
        {
            return new AppSettings();
        }
    }

    public static void Save(AppSettings settings)
    {
        try
        {
            Directory.CreateDirectory(SettingsDir);
            File.WriteAllText(SettingsPath, JsonSerializer.Serialize(settings, JsonOptions));
        }
        catch { }
    }
}
