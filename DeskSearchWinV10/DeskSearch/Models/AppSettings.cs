namespace DeskSearch.Models;

using DeskSearch.Services;

public sealed class AppSettings
{
    public string BackgroundColor { get; set; } = "#FFFFFF";
    public int BackgroundOpacity { get; set; } = 95;
    public string BorderColor { get; set; } = "#33000000";
    public string TextColor { get; set; } = "#222222";
    public string SubTextColor { get; set; } = "#888888";
    public bool AlwaysOnTop { get; set; } = true;
    public string Language { get; set; } = "ko";
    public int WindowOpacity { get; set; } = 100;
    public double? WindowLeft { get; set; }
    public double? WindowTop { get; set; }
    public double? WindowWidth { get; set; }
    public double? WindowHeight { get; set; }
    public bool CaseSensitiveSearch { get; set; }
    public bool UseRegexSearch { get; set; }
    public SearchResultSortOrder SearchResultSort { get; set; } = SearchResultSortOrder.MatchQuality;
    public bool RunAtStartup { get; set; } = true;
    public int PeriodicResyncHours { get; set; } = IndexResyncPolicy.DefaultPeriodicResyncHours;
    public List<string> ExcludedDrives { get; set; } = [];
    public List<string> ExcludedDirectories { get; set; } = [];
    public string? LastExcludedDirectoryBrowsePath { get; set; }

    public AppSettings Clone() => new()
    {
        BackgroundColor = BackgroundColor,
        BackgroundOpacity = BackgroundOpacity,
        BorderColor = BorderColor,
        TextColor = TextColor,
        SubTextColor = SubTextColor,
        AlwaysOnTop = AlwaysOnTop,
        Language = Language,
        WindowOpacity = WindowOpacity,
        WindowLeft = WindowLeft,
        WindowTop = WindowTop,
        WindowWidth = WindowWidth,
        WindowHeight = WindowHeight,
        CaseSensitiveSearch = CaseSensitiveSearch,
        UseRegexSearch = UseRegexSearch,
        SearchResultSort = SearchResultSort,
        RunAtStartup = RunAtStartup,
        PeriodicResyncHours = PeriodicResyncHours,
        ExcludedDrives = [.. ExcludedDrives],
        ExcludedDirectories = [.. ExcludedDirectories],
        LastExcludedDirectoryBrowsePath = LastExcludedDirectoryBrowsePath
    };
}
