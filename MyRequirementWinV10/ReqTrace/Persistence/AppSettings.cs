namespace ReqTrace.Persistence;

public class AppSettings
{
    public List<string> RecentFiles { get; set; } = new();
    public string LastProjectPath { get; set; } = string.Empty;
    public string LastProjectFolder { get; set; } = string.Empty;
    public string LastImportFolder { get; set; } = string.Empty;
    public string LastExportFolder { get; set; } = string.Empty;
    public int WindowWidth { get; set; } = 1200;
    public int WindowHeight { get; set; } = 800;
    public string Language { get; set; } = "ko-KR";
}
