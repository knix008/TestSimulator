namespace DeskSearch.Models;

public sealed class SearchBatchResult
{
    public required IReadOnlyList<FileEntry> Results { get; init; }
    public required int NextOffset { get; init; }
    public required long NextScanId { get; init; }
    public required bool IsComplete { get; init; }
    public required List<(FileEntry Entry, int Score)> TopCandidates { get; init; }
}
