using System.Text.Json;

namespace YOLO11BrainV10.Services;

internal sealed class UserPreferences
{
    /// <summary>Override for CT / slice downloads. When null, app uses %LocalAppData%\YOLO11BrainV10\data\ct.</summary>
    public string? SampleAssetsDirectory { get; set; }

    /// <summary>YOLO 세그/검출 최소 신뢰도 임계값 (0.01–1.0). null이면 UI 기본값(0.25) 사용.</summary>
    public double? SegmentationMinConfidence { get; set; }

    private static string PreferencesFilePath =>
        System.IO.Path.Combine(AppDataPaths.GetAppDataRoot(), "preferences.json");

    internal static UserPreferences Load()
    {
        try
        {
            var p = PreferencesFilePath;
            if (!File.Exists(p))
                return new UserPreferences();
            var json = File.ReadAllText(p);
            return JsonSerializer.Deserialize<UserPreferences>(json) ?? new UserPreferences();
        }
        catch
        {
            return new UserPreferences();
        }
    }

    internal void Save()
    {
        try
        {
            Directory.CreateDirectory(AppDataPaths.GetAppDataRoot());
            var json = JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(PreferencesFilePath, json);
        }
        catch
        {
            // ignore persistence failures
        }
    }
}
