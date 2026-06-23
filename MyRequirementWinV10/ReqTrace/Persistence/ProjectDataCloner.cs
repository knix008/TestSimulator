using System.Text.Json;
using ReqTrace.Models;

namespace ReqTrace.Persistence;

public static class ProjectDataCloner
{
    public static ProjectData Clone(ProjectData source)
    {
        var json = JsonSerializer.Serialize(source, JsonSerializationSettings.Default);
        return JsonSerializer.Deserialize<ProjectData>(json, JsonSerializationSettings.Default)
               ?? throw new InvalidOperationException("Failed to clone project data.");
    }
}
