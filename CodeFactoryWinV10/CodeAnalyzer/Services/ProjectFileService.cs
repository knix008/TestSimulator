using System.Text;
using System.Text.Json;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public static class ProjectFileService
{
    public const string FileExtension = ".caproj";
    public const string FileFilter = "CodeAnalyzer 프로젝트 (*.caproj)|*.caproj|모든 파일 (*.*)|*.*";

    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    public static void SaveToFile(AnalysisProject project, string filePath)
    {
        project.SavedAt = DateTime.UtcNow;
        var json = JsonSerializer.Serialize(project, JsonOptions);
        File.WriteAllText(filePath, json, Encoding.UTF8);
    }

    public static AnalysisProject? LoadFromFile(string filePath)
    {
        var json = File.ReadAllText(filePath, Encoding.UTF8);
        return JsonSerializer.Deserialize<AnalysisProject>(json);
    }
}
