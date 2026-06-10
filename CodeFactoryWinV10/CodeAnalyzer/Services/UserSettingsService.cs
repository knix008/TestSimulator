using System.Text.Json;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public sealed class UserSettingsService
{
    private const int CurrentSchemaVersion = 3;
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

            // One-time migration: inspection catalog defaults should show every option selected.
            if (settings.SchemaVersion < 3)
            {
                settings.EnabledInspections = MetricInspectionCatalog.AllCatalogOptions;
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
        settings.WarnStatementCount = thresholds.WarnStatementCount;
        settings.WarnSwitchCaseCount = thresholds.WarnSwitchCaseCount;
        settings.WarnPublicApiCount = thresholds.WarnPublicApiCount;
        settings.WarnMinTestCodePercent = thresholds.WarnMinTestCodePercent;
        settings.WarnInstability = thresholds.WarnInstability;
        settings.WarnLackOfCohesion = thresholds.WarnLackOfCohesion;
        settings.WarnInheritanceDepth = thresholds.WarnInheritanceDepth;
        settings.WarnGitChangeLines = thresholds.WarnGitChangeLines;
        settings.WarnSecuritySmellCount = thresholds.WarnSecuritySmellCount;
        settings.EnabledInspections = MetricInspectionCatalog.NormalizeScope(thresholds.EnabledInspections);
        settings.EnabledAnalysisScope = AnalysisScopeResolver.Resolve(settings.EnabledInspections);
        settings.IncludedDirectoryPaths = CloneDirectoryPaths(thresholds.IncludedDirectoryPaths);
        settings.ExcludedDirectoryPaths = CloneDirectoryPaths(thresholds.ExcludedDirectoryPaths);
        settings.DatabaseConnection = DatabaseConnectionSettings.Normalize(thresholds.DatabaseConnection);
        SaveSettings(settings);
    }

    public void SaveDatabaseConnection(DatabaseConnectionSettings databaseConnection)
    {
        var settings = LoadSettings();
        settings.DatabaseConnection = DatabaseConnectionSettings.Normalize(databaseConnection);
        SaveSettings(settings);
    }

    private static List<string> CloneDirectoryPaths(IReadOnlyList<string>? paths) =>
        paths is null || paths.Count == 0 ? [] : paths.ToList();

    private static void Normalize(UserAnalysisSettings settings)
    {
        settings.EnabledInspections = MetricInspectionCatalog.NormalizeScope(settings.EnabledInspections);
        settings.EnabledAnalysisScope = AnalysisScopeResolver.Resolve(settings.EnabledInspections);
        settings.IncludedDirectoryPaths = CloneDirectoryPaths(settings.IncludedDirectoryPaths);
        settings.ExcludedDirectoryPaths = CloneDirectoryPaths(settings.ExcludedDirectoryPaths);
        settings.DatabaseConnection = DatabaseConnectionSettings.Normalize(settings.DatabaseConnection);

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

        if (settings.WarnStatementCount > 0)
        {
            settings.WarnStatementCount = Math.Clamp(settings.WarnStatementCount, 10, 500);
        }

        if (settings.WarnSwitchCaseCount > 0)
        {
            settings.WarnSwitchCaseCount = Math.Clamp(settings.WarnSwitchCaseCount, 3, 200);
        }

        if (settings.WarnPublicApiCount > 0)
        {
            settings.WarnPublicApiCount = Math.Clamp(settings.WarnPublicApiCount, 5, 500);
        }

        if (settings.WarnMinTestCodePercent > 0)
        {
            settings.WarnMinTestCodePercent = Math.Clamp(settings.WarnMinTestCodePercent, 0, 100);
        }

        if (settings.WarnInstability > 0)
        {
            settings.WarnInstability = Math.Clamp(settings.WarnInstability, 0, 1);
        }

        if (settings.WarnLackOfCohesion > 0)
        {
            settings.WarnLackOfCohesion = Math.Clamp(settings.WarnLackOfCohesion, 0, 1);
        }

        if (settings.WarnInheritanceDepth > 0)
        {
            settings.WarnInheritanceDepth = Math.Clamp(settings.WarnInheritanceDepth, 2, 20);
        }

        if (settings.WarnGitChangeLines > 0)
        {
            settings.WarnGitChangeLines = Math.Clamp(settings.WarnGitChangeLines, 50, 1_000_000);
        }

        if (settings.WarnSecuritySmellCount > 0)
        {
            settings.WarnSecuritySmellCount = Math.Clamp(settings.WarnSecuritySmellCount, 1, 100);
        }
    }
}
