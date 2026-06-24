namespace DeskSearch.Models;

public sealed class SearchSession
{
    public required string Query { get; init; }
    public required bool CaseSensitive { get; init; }
    public required bool UseRegexSearch { get; init; }
    public required ResolvedSearchQuery SearchQuery { get; init; }
    public bool IsInvalidRegex => SearchQuery.IsInvalid;
    public int Offset { get; set; }
    public long LastScannedId { get; set; }
    public bool IsComplete { get; set; }
    public int LastScannedCount { get; set; }
    public List<(FileEntry Entry, int Score)> TopCandidates { get; set; } = [];
}
