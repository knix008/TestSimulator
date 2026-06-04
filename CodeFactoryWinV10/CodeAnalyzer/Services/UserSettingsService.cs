using System.Text.Json;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public sealed class UserSettingsService
{
    private const int CurrentSchemaVersion = 1;
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

    public bool HasSettingsFile() => File.Exists(_settingsFilePath);

    public UserAnalysisSettings LoadSettings()
    {
        if (!HasSettingsFile())
        {
            return UserAnalysisSettings.CreateDefaults();
        }

        try
        {
            var json = File.ReadAllText(_settingsFilePath);
            var settings = JsonSerializer.Deserialize<UserAnalysisSettings>(json);
            if (settings is null)
            {
                return UserAnalysisSettings.CreateDefaults();
            }

            // One-time migration: MinDuplicateLines was corrupted to 5 by a bug before schema versioning.
            // Reset it so the designer default (10) is used instead.
            if (settings.SchemaVersion < 1 && settings.MinDuplicateLines == 5)
            {
                settings.MinDuplicateLines = 0;
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
            return UserAnalysisSettings.CreateDefaults();
        }
    }

    public string? LoadLastRootDirectory() => LoadSettings().LastRootDirectory;

    public int LoadMinDuplicateLines() => LoadSettings().MinDuplicateLines;

    public void SaveSettings(UserAnalysisSettings settings)
    {
        settings.SchemaVersion = CurrentSchemaVersion;
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
        if (thresholds.MinDuplicateLines > 0)
        {
            settings.MinDuplicateLines = Math.Clamp(
                thresholds.MinDuplicateLines,
                UserAnalysisSettings.MinDuplicateLinesFloor,
                UserAnalysisSettings.MinDuplicateLinesCeiling);
        }

        settings.WarnCyclomaticComplexity = thresholds.WarnCyclomaticComplexity;
        settings.WarnCognitiveComplexity = thresholds.WarnCognitiveComplexity;
        settings.WarnMaxNestingDepth = thresholds.WarnMaxNestingDepth;
        settings.WarnParameterCount = thresholds.WarnParameterCount;
        settings.WarnFanOut = thresholds.WarnFanOut;
        settings.WarnMaintenanceIndex = thresholds.WarnMaintenanceIndex;
        settings.WarnTodoDensityPer100Lines = thresholds.WarnTodoDensityPer100Lines;
        settings.WarnReturnCount = thresholds.WarnReturnCount;
        settings.WarnMagicNumbers = thresholds.WarnMagicNumbers;
        settings.WarnGodFileCodeLines = thresholds.WarnGodFileCodeLines;
        settings.WarnMinCommentPercent = thresholds.WarnMinCommentPercent;
        settings.WarnGodTypeMemberCount = thresholds.WarnGodTypeMemberCount;
        settings.EnabledInspections = MetricInspectionCatalog.NormalizeScope(thresholds.EnabledInspections);
        settings.EnabledAnalysisScope = AnalysisScopeResolver.Resolve(settings.EnabledInspections);
        settings.IncludedDirectoryPaths = [];
        settings.ExcludedDirectoryPaths = CloneDirectoryPaths(thresholds.ExcludedDirectoryPaths);
        SaveSettings(settings);
    }

    private static List<string> CloneDirectoryPaths(IReadOnlyList<string>? paths) =>
        paths is null || paths.Count == 0 ? [] : paths.ToList();

    private static void Normalize(UserAnalysisSettings settings)
    {
        settings.EnabledInspections = MetricInspectionCatalog.NormalizeScope(settings.EnabledInspections);
        settings.EnabledAnalysisScope = AnalysisScopeResolver.Resolve(settings.EnabledInspections);
        settings.IncludedDirectoryPaths = [];
        settings.ExcludedDirectoryPaths = CloneDirectoryPaths(settings.ExcludedDirectoryPaths);

        if (settings.MinDuplicateLines > 0)
        {
            settings.MinDuplicateLines = Math.Clamp(
                settings.MinDuplicateLines,
                UserAnalysisSettings.MinDuplicateLinesFloor,
                UserAnalysisSettings.MinDuplicateLinesCeiling);
        }

        if (settings.WarnCyclomaticComplexity > 0)
        {
            settings.WarnCyclomaticComplexity = Math.Clamp(settings.WarnCyclomaticComplexity, 1, 200);
        }

        if (settings.WarnCognitiveComplexity > 0)
        {
            settings.WarnCognitiveComplexity = Math.Clamp(settings.WarnCognitiveComplexity, 1, 200);
        }

        if (settings.WarnMaxNestingDepth > 0)
        {
            settings.WarnMaxNestingDepth = Math.Clamp(settings.WarnMaxNestingDepth, 1, 50);
        }

        if (settings.WarnParameterCount > 0)
        {
            settings.WarnParameterCount = Math.Clamp(settings.WarnParameterCount, 1, 50);
        }

        if (settings.WarnFanOut > 0)
        {
            settings.WarnFanOut = Math.Clamp(settings.WarnFanOut, 1, 500);
        }

        if (settings.WarnMaintenanceIndex > 0)
        {
            settings.WarnMaintenanceIndex = Math.Clamp(settings.WarnMaintenanceIndex, 0, 171);
        }

        if (settings.WarnTodoDensityPer100Lines > 0)
        {
            settings.WarnTodoDensityPer100Lines = Math.Clamp(settings.WarnTodoDensityPer100Lines, 0, 100);
        }

        if (settings.WarnReturnCount > 0)
        {
            settings.WarnReturnCount = Math.Clamp(settings.WarnReturnCount, 1, 50);
        }

        if (settings.WarnMagicNumbers > 0)
        {
            settings.WarnMagicNumbers = Math.Clamp(settings.WarnMagicNumbers, 1, 100);
        }

        if (settings.WarnGodFileCodeLines > 0)
        {
            settings.WarnGodFileCodeLines = Math.Clamp(settings.WarnGodFileCodeLines, 100, 50_000);
        }

        if (settings.WarnMinCommentPercent > 0)
        {
            settings.WarnMinCommentPercent = Math.Clamp(settings.WarnMinCommentPercent, 0, 100);
        }

        if (settings.WarnGodTypeMemberCount > 0)
        {
            settings.WarnGodTypeMemberCount = Math.Clamp(settings.WarnGodTypeMemberCount, 5, 500);
        }
    }
}
