namespace DeskSearch.Models;

public sealed class IndexProgressEventArgs(int indexedCount, string? currentPath, bool isScanComplete) : EventArgs
{
    public int IndexedCount { get; } = indexedCount;
    public string? CurrentPath { get; } = currentPath;
    public bool IsScanComplete { get; } = isScanComplete;
}
