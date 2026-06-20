namespace ReqTrace.Models;

public class ProjectData
{
    public string ProjectName { get; set; } = "New Project";
    public string SchemaVersion { get; set; } = "1.0";
    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
    public DateTime LastModifiedUtc { get; set; } = DateTime.UtcNow;
    public List<Requirement> Requirements { get; set; } = new();
}
