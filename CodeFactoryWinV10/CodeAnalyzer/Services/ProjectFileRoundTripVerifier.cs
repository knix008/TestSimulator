using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

/// <summary>프로젝트(.caproj) 저장·불러오기가 모든 설정을 보존하는지 검증합니다.</summary>
internal static class ProjectFileRoundTripVerifier
{
    public static bool Run()
    {
        var original = CreateSampleProject();
        var tempPath = Path.Combine(Path.GetTempPath(), $"CodeAnalyzer-project-verify-{Guid.NewGuid():N}.caproj");

        try
        {
            ProjectFileService.SaveToFile(original, tempPath);
            var loaded = ProjectFileService.LoadFromFile(tempPath);
            return loaded is not null && AreEquivalent(original, loaded);
        }
        finally
        {
            if (File.Exists(tempPath))
            {
                File.Delete(tempPath);
            }
        }
    }

    private static AnalysisProject CreateSampleProject()
    {
        var settings = UserAnalysisSettings.CreateDefaults();
        settings.MinDuplicateLines = 8;
        settings.WarnCyclomaticComplexity = 12;
        settings.WarnGitChangeLines = 750;
        settings.EnabledInspections =
            MetricInspectionKind.ShowFunctionsTab
            | MetricInspectionKind.CyclomaticComplexity
            | MetricInspectionKind.DatabaseSchema;
        settings.IncludedDirectoryPaths = [".", "src"];
        settings.DatabaseConnection = new DatabaseConnectionSettings
        {
            Enabled = true,
            SaveOnAnalysisComplete = false,
            Provider = AnalysisDatabaseProvider.MySql,
            Host = "db.example.com",
            Port = 3307,
            Database = "analyzer",
            Username = "app",
            Password = "secret",
            TablePrefix = "ca_",
            AutoCreateSchema = false
        };

        return new AnalysisProject
        {
            Name = "Sample",
            RootDirectory = @"C:\SampleProject",
            EnabledLanguageIds = ["csharp", "python"],
            IncludedDirectoryPaths = [".", "src"],
            Settings = settings
        };
    }

    private static bool AreEquivalent(AnalysisProject original, AnalysisProject loaded)
    {
        if (!string.Equals(original.RootDirectory, loaded.RootDirectory, StringComparison.OrdinalIgnoreCase)
            || original.EnabledLanguageIds.Count != loaded.EnabledLanguageIds.Count
            || !original.EnabledLanguageIds.SequenceEqual(loaded.EnabledLanguageIds, StringComparer.OrdinalIgnoreCase)
            || original.IncludedDirectoryPaths.Count != loaded.IncludedDirectoryPaths.Count
            || !original.IncludedDirectoryPaths.SequenceEqual(loaded.IncludedDirectoryPaths, StringComparer.OrdinalIgnoreCase))
        {
            return false;
        }

        var source = original.Settings;
        var target = loaded.Settings;

        return source.MinDuplicateLines == target.MinDuplicateLines
            && source.WarnCyclomaticComplexity == target.WarnCyclomaticComplexity
            && source.WarnGitChangeLines == target.WarnGitChangeLines
            && source.EnabledInspections == target.EnabledInspections
            && source.DatabaseConnection.Enabled == target.DatabaseConnection.Enabled
            && source.DatabaseConnection.SaveOnAnalysisComplete == target.DatabaseConnection.SaveOnAnalysisComplete
            && source.DatabaseConnection.Provider == target.DatabaseConnection.Provider
            && source.DatabaseConnection.Host == target.DatabaseConnection.Host
            && source.DatabaseConnection.Port == target.DatabaseConnection.Port
            && source.DatabaseConnection.Database == target.DatabaseConnection.Database
            && source.DatabaseConnection.Username == target.DatabaseConnection.Username
            && source.DatabaseConnection.Password == target.DatabaseConnection.Password
            && source.DatabaseConnection.TablePrefix == target.DatabaseConnection.TablePrefix
            && source.DatabaseConnection.AutoCreateSchema == target.DatabaseConnection.AutoCreateSchema
            && target.IncludedDirectoryPaths.SequenceEqual(original.IncludedDirectoryPaths, StringComparer.OrdinalIgnoreCase)
            && string.Equals(target.LastRootDirectory, original.RootDirectory, StringComparison.OrdinalIgnoreCase);
    }
}
