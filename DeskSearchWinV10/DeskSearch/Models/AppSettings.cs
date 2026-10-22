namespace DeskSearch.Models;

public sealed class AppSettings
{
    public string BackgroundColor { get; set; } = "#FFFFFF";
    public int BackgroundOpacity { get; set; } = 95;
    public string BorderColor { get; set; } = "#33000000";
    public double BorderThickness { get; set; } = 1;
    public string TextColor { get; set; } = "#222222";
    public string SubTextColor { get; set; } = "#888888";
    public string IconColor { get; set; } = "#141414";
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
    public List<string> IncludedDrives { get; set; } = [];
    public List<string> IncludedDirectories { get; set; } = [];
    /// <summary>Folders (and descendants) skipped during indexing and search.</summary>
    public List<string> ExcludedDirectories { get; set; } = [];
    public string? LastIncludedDirectoryBrowsePath { get; set; }
    public string? LastExcludedDirectoryBrowsePath { get; set; }
    /// <summary>
    /// Hours between automatic full re-index runs. 0 disables scheduling.
    /// Allowed values: 0, 6, 12, 24, 168 (weekly).
    /// </summary>
    public int PeriodicIndexIntervalHours { get; set; }
    /// <summary>UTC time of the last successful full index promote (index.building.db → index.db).</summary>
    public DateTime? LastFullIndexCompletedUtc { get; set; }

    public static readonly int[] AllowedPeriodicIndexIntervalHours = [0, 6, 12, 24, 168];

    public static int NormalizePeriodicIndexIntervalHours(int hours) =>
        Array.IndexOf(AllowedPeriodicIndexIntervalHours, hours) >= 0 ? hours : 0;

    public AppSettings Clone() => new()
    {
        BackgroundColor = BackgroundColor,
        BackgroundOpacity = BackgroundOpacity,
        BorderColor = BorderColor,
        BorderThickness = BorderThickness,
        TextColor = TextColor,
        SubTextColor = SubTextColor,
        IconColor = IconColor,
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
        IncludedDrives = [.. IncludedDrives],
        IncludedDirectories = [.. IncludedDirectories],
        ExcludedDirectories = [.. ExcludedDirectories],
        LastIncludedDirectoryBrowsePath = LastIncludedDirectoryBrowsePath,
        LastExcludedDirectoryBrowsePath = LastExcludedDirectoryBrowsePath,
        PeriodicIndexIntervalHours = PeriodicIndexIntervalHours,
        LastFullIndexCompletedUtc = LastFullIndexCompletedUtc
    };
}
