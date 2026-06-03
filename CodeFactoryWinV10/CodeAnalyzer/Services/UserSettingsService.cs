using System.Text.Json;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public sealed class UserSettingsService
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    private readonly string _settingsFilePath;

    public UserSettingsService()
    {
        var settingsDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "CodeAnalyzer");

        Directory.CreateDirectory(settingsDirectory);
        _settingsFilePath = Path.Combine(settingsDirectory, "settings.json");
    }

    public UserAnalysisSettings LoadSettings()
    {
        if (!File.Exists(_settingsFilePath))
        {
            return new UserAnalysisSettings();
        }

        try
        {
            var json = File.ReadAllText(_settingsFilePath);
            var settings = JsonSerializer.Deserialize<UserAnalysisSettings>(json);
            if (settings is null)
            {
                return new UserAnalysisSettings();
            }

            Normalize(settings);

            if (!string.IsNullOrWhiteSpace(settings.LastRootDirectory) && !Directory.Exists(settings.LastRootDirectory))
            {
                settings.LastRootDirectory = null;
            }

            return settings;
        }
        catch
        {
            return new UserAnalysisSettings();
        }
    }

    public string? LoadLastRootDirectory() => LoadSettings().LastRootDirectory;

    public int LoadMinDuplicateLines() => LoadSettings().MinDuplicateLines;

    public void SaveSettings(UserAnalysisSettings settings)
    {
        Normalize(settings);

        if (!string.IsNullOrWhiteSpace(settings.LastRootDirectory) && !Directory.Exists(settings.LastRootDirectory))
        {
            settings.LastRootDirectory = null;
        }

        try
        {
            var json = JsonSerializer.Serialize(settings, JsonOptions);
            File.WriteAllText(_settingsFilePath, json);
        }
        catch
        {
            // 설정 저장 실패는 분석 기능에 영향을 주지 않도록 무시합니다.
        }
    }

    public void SaveLastRootDirectory(string rootDirectory)
    {
        var settings = LoadSettings();
        if (string.IsNullOrWhiteSpace(rootDirectory) || !Directory.Exists(rootDirectory))
        {
            return;
        }

        settings.LastRootDirectory = Path.GetFullPath(rootDirectory);
        SaveSettings(settings);
    }

    public void SaveMinDuplicateLines(int minDuplicateLines)
    {
        var settings = LoadSettings();
        settings.MinDuplicateLines = minDuplicateLines;
        SaveSettings(settings);
    }

    public void SaveQualityThresholds(UserAnalysisSettings thresholds)
    {
        var settings = LoadSettings();
        settings.WarnCyclomaticComplexity = thresholds.WarnCyclomaticComplexity;
        settings.WarnCognitiveComplexity = thresholds.WarnCognitiveComplexity;
        settings.WarnMaxNestingDepth = thresholds.WarnMaxNestingDepth;
        settings.WarnParameterCount = thresholds.WarnParameterCount;
        settings.WarnFanOut = thresholds.WarnFanOut;
        settings.WarnMaintenanceIndex = thresholds.WarnMaintenanceIndex;
        settings.WarnTodoDensityPer100Lines = thresholds.WarnTodoDensityPer100Lines;
        SaveSettings(settings);
    }

    private static void Normalize(UserAnalysisSettings settings)
    {
        settings.MinDuplicateLines = Math.Clamp(
            settings.MinDuplicateLines,
            UserAnalysisSettings.MinDuplicateLinesFloor,
            UserAnalysisSettings.MinDuplicateLinesCeiling);

        settings.WarnCyclomaticComplexity = Math.Clamp(settings.WarnCyclomaticComplexity, 1, 200);
        settings.WarnCognitiveComplexity = Math.Clamp(settings.WarnCognitiveComplexity, 1, 200);
        settings.WarnMaxNestingDepth = Math.Clamp(settings.WarnMaxNestingDepth, 1, 50);
        settings.WarnParameterCount = Math.Clamp(settings.WarnParameterCount, 1, 50);
        settings.WarnFanOut = Math.Clamp(settings.WarnFanOut, 1, 500);
        settings.WarnMaintenanceIndex = Math.Clamp(settings.WarnMaintenanceIndex, 0, 171);
        settings.WarnTodoDensityPer100Lines = Math.Clamp(settings.WarnTodoDensityPer100Lines, 0, 100);
    }
}
