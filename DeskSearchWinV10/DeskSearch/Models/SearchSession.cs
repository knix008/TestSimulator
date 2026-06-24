namespace DeskSearch.Models;

public sealed class SearchSession
{
    public required string Query { get; init; }
    public required bool CaseSensitive { get; init; }
    public int Offset { get; set; }
    public bool IsComplete { get; set; }
    public List<(FileEntry Entry, int Score)> TopCandidates { get; set; } = [];
}
