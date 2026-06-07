using System.Text.Json;
using System.Text.Json.Serialization;
using MyUML20WinV10.Models;

namespace MyUML20WinV10.Serialization;

public static class UmlProjectSerializer
{
    public const string FileExtension = ".uml20";
    public const string FileFilter = "UML 2.0 프로젝트 (*.uml20)|*.uml20|모든 파일 (*.*)|*.*";

    private static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    public static bool IsProjectFile(string? path) =>
        !string.IsNullOrWhiteSpace(path)
        && path.EndsWith(FileExtension, StringComparison.OrdinalIgnoreCase)
        && File.Exists(path);

    public static void Save(UmlProject project, string path)
    {
        var json = JsonSerializer.Serialize(project, Options);
        File.WriteAllText(path, json);
    }

    public static UmlProject Load(string path)
    {
        var json = File.ReadAllText(path);
        return JsonSerializer.Deserialize<UmlProject>(json, Options)
            ?? throw new InvalidDataException("UML 프로젝트 파일을 읽을 수 없습니다.");
    }
}
