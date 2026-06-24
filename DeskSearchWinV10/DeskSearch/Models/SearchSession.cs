using System.Text.RegularExpressions;

namespace DeskSearch.Models;

public sealed class SearchSession
{
    public required string Query { get; init; }
    public required bool CaseSensitive { get; init; }
    public required bool UseRegexSearch { get; init; }
    public Regex? Regex { get; init; }
    public bool IsInvalidRegex { get; init; }
    public int Offset { get; set; }
    public bool IsComplete { get; set; }
    public int LastScannedCount { get; set; }
    public List<(FileEntry Entry, int Score)> TopCandidates { get; set; } = [];
}
