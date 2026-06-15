using System.Text.Json;
using MyAgileBoardWinV10.Models;

namespace MyAgileBoardWinV10.Services;

public static class AppSettings
{
    private static string? _lastDirectory;
    private static BurndownChartColorSettings _burndownChart = BurndownChartColorSettings.CreateDefault();
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

    public static BurndownChartColorSettings GetBurndownChartColors()
    {
        EnsureLoaded();
        return _burndownChart.Clone();
    }

    public static void SetBurndownChartColors(BurndownChartColorSettings colors)
    {
        EnsureLoaded();
        _burndownChart = colors.Clone();
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
            var root = doc.RootElement;

            if (root.TryGetProperty("lastDirectory", out var dirProp))
                _lastDirectory = dirProp.GetString();

            if (root.TryGetProperty("burndownChart", out var chartProp))
            {
                if (chartProp.TryGetProperty("dailyBarHex", out var bar))
                    _burndownChart.DailyBarHex = bar.GetString() ?? _burndownChart.DailyBarHex;
                if (chartProp.TryGetProperty("idealLineHex", out var ideal))
                    _burndownChart.IdealLineHex = ideal.GetString() ?? _burndownChart.IdealLineHex;
                if (chartProp.TryGetProperty("remainingLineHex", out var remaining))
                    _burndownChart.RemainingLineHex = remaining.GetString() ?? _burndownChart.RemainingLineHex;
            }
        }
        catch { /* 손상된 설정 파일은 무시 */ }
    }

    private static void Save()
    {
        try
        {
            var dir = Path.GetDirectoryName(SettingsPath)!;
            Directory.CreateDirectory(dir);
            var payload = new
            {
                lastDirectory = _lastDirectory,
                burndownChart = new
                {
                    dailyBarHex = _burndownChart.DailyBarHex,
                    idealLineHex = _burndownChart.IdealLineHex,
                    remainingLineHex = _burndownChart.RemainingLineHex
                }
            };
            var json = JsonSerializer.Serialize(payload);
            File.WriteAllText(SettingsPath, json);
        }
        catch { /* 설정 저장 실패 시 무시 */ }
    }
}
