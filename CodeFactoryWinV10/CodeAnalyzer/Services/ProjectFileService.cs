using System.Text;
using System.Text.Json;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public static class ProjectFileService
{
    public const string FileExtension = ".caproj";
    public const string FileFilter = "CodeAnalyzer 프로젝트 (*.caproj)|*.caproj|모든 파일 (*.*)|*.*";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };

    public static void SaveToFile(AnalysisProject project, string filePath)
    {
        Normalize(project);
        project.SavedAt = DateTime.UtcNow;
        var json = JsonSerializer.Serialize(project, JsonOptions);
        File.WriteAllText(filePath, json, Encoding.UTF8);
    }

    public static AnalysisProject? LoadFromFile(string filePath)
    {
        var json = File.ReadAllText(filePath, Encoding.UTF8);
        var project = JsonSerializer.Deserialize<AnalysisProject>(json, JsonOptions);
        if (project is null)
        {
            return null;
        }

        Normalize(project);
        return project;
    }

    public static IReadOnlyList<string> ResolveIncludedDirectoryPaths(AnalysisProject project)
    {
        if (project.IncludedDirectoryPaths.Count > 0)
        {
            return project.IncludedDirectoryPaths;
        }

        if (project.Settings?.IncludedDirectoryPaths.Count > 0)
        {
            return project.Settings.IncludedDirectoryPaths;
        }

        return [];
    }

    public static void Normalize(AnalysisProject project)
    {
        project.EnabledLanguageIds ??= [];
        project.IncludedDirectoryPaths ??= [];
        project.ExcludedDirectoryPaths ??= [];
        project.Settings ??= new UserAnalysisSettings();
        project.Settings = UserAnalysisSettings.ResolveForAnalysis(project.Settings);

        var included = ResolveIncludedDirectoryPaths(project).ToList();
        project.IncludedDirectoryPaths = included;
        project.Settings.IncludedDirectoryPaths = included;
        project.Settings.ExcludedDirectoryPaths = [];

        if (!string.IsNullOrWhiteSpace(project.RootDirectory))
        {
            project.Settings.LastRootDirectory = project.RootDirectory;
        }
    }
}
