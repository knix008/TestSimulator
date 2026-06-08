namespace CodeAnalyzer.Models;

public sealed class AnalysisProject
{
    public string Version { get; set; } = "1";
    public string Name { get; set; } = "";
    public string RootDirectory { get; set; } = "";
    public List<string> EnabledLanguageIds { get; set; } = [];
    public List<string> ExcludedDirectoryPaths { get; set; } = [];
    public UserAnalysisSettings Settings { get; set; } = new();
    public DateTime SavedAt { get; set; } = DateTime.UtcNow;
}
