namespace DeskSearch.Models;

public sealed class IndexProgressEventArgs(
    int indexedCount,
    string? currentPath,
    bool isScanComplete,
    int progressPercent,
    IndexProgressPhase phase) : EventArgs
{
    public int IndexedCount { get; } = indexedCount;
    public string? CurrentPath { get; } = currentPath;
    public bool IsScanComplete { get; } = isScanComplete;
    public int ProgressPercent { get; } = progressPercent;
    public IndexProgressPhase Phase { get; } = phase;
}
