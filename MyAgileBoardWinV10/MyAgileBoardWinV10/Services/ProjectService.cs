using System.Text.Json;
using System.Text.Json.Serialization;
using MyAgileBoardWinV10.Models;

namespace MyAgileBoardWinV10.Services;

public static class ProjectService
{
    internal static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
        Converters = { new JsonStringEnumConverter() }
    };

    public static void Save(KanbanProject project, string filePath)
    {
        ProjectBoardSync.Normalize(project);
        var json = JsonSerializer.Serialize(project, Options);
        File.WriteAllText(filePath, json);
        project.FilePath = filePath;
    }

    public static KanbanProject? Load(string filePath)
    {
        if (!File.Exists(filePath)) return null;
        var json = File.ReadAllText(filePath);
        var project = JsonSerializer.Deserialize<KanbanProject>(json, Options);
        if (project != null)
        {
            project.FilePath = filePath;
            ProjectBoardSync.Normalize(project);
        }
        return project;
    }
}
