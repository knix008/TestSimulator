using System.Text.Json;
using System.Text.Json.Serialization;
using MyDiagramWinV10.Models;

namespace MyDiagramWinV10.Serialization;

public static class DiagramProjectSerializer
{
    public const string FileExtension = ".mdg";
    public const string FileFilter = "MyDiagram 프로젝트 (*.mdg)|*.mdg|모든 파일 (*.*)|*.*";

    private static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
    };

    public static void Save(DiagramProject project, string path)
    {
        var json = JsonSerializer.Serialize(project, Options);
        File.WriteAllText(path, json);
    }

    public static DiagramProject Load(string path)
    {
        var json = File.ReadAllText(path);
        return JsonSerializer.Deserialize<DiagramProject>(json, Options)
            ?? throw new InvalidDataException("프로젝트 파일을 읽을 수 없습니다.");
    }
}
