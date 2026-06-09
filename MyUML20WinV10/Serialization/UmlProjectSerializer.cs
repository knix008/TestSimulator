using System.Text.Json;
using System.Text.Json.Serialization;
using MyUML20WinV10.Models;

namespace MyUML20WinV10.Serialization;

public static class UmlProjectSerializer
{
    public const string ProjectFileExtension = ".umlprj";
    public const string UmlFileExtension = ".uml";
    public const string LegacyFileExtension = ".uml20";

    public const string OpenFileFilter =
        "UML 프로젝트 (*.umlprj)|*.umlprj|UML 파일 (*.uml)|*.uml|모든 파일 (*.*)|*.*";

    public const string SaveFileFilter =
        "UML 프로젝트 (*.umlprj)|*.umlprj|모든 파일 (*.*)|*.*";

    private static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    public static bool IsProjectFile(string? path) =>
        IsSupportedProjectPath(path);

    public static bool IsSupportedProjectPath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
            return false;

        return path.EndsWith(ProjectFileExtension, StringComparison.OrdinalIgnoreCase)
            || path.EndsWith(UmlFileExtension, StringComparison.OrdinalIgnoreCase)
            || path.EndsWith(LegacyFileExtension, StringComparison.OrdinalIgnoreCase);
    }

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
