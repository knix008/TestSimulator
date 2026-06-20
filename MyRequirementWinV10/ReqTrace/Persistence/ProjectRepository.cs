using System.Text.Json;
using ReqTrace.Models;

namespace ReqTrace.Persistence;

public static class ProjectRepository
{
    public static ProjectData CreateNew(string projectName)
    {
        return new ProjectData { ProjectName = projectName };
    }

    public static ProjectData Load(string filePath)
    {
        try
        {
            var json = File.ReadAllText(filePath);
            var data = JsonSerializer.Deserialize<ProjectData>(json, JsonSerializationSettings.Default);
            if (data is null)
                throw new InvalidOperationException("File deserialized to null.");
            return data;
        }
        catch (Exception ex) when (ex is JsonException or InvalidOperationException or IOException)
        {
            throw new ProjectLoadException($"Failed to load project file '{filePath}'. It may be corrupted or in an unsupported format.", ex);
        }
    }

    public static void Save(ProjectData data, string filePath)
    {
        data.LastModifiedUtc = DateTime.UtcNow;

        if (File.Exists(filePath))
        {
            var backupPath = filePath + ".bak";
            File.Copy(filePath, backupPath, overwrite: true);
        }

        var json = JsonSerializer.Serialize(data, JsonSerializationSettings.Default);
        var tempPath = filePath + ".tmp";
        File.WriteAllText(tempPath, json);

        if (File.Exists(filePath))
            File.Replace(tempPath, filePath, null);
        else
            File.Move(tempPath, filePath);
    }
}
