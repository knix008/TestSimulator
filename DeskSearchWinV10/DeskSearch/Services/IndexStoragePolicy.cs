namespace DeskSearch.Services;

/// <summary>
/// DeskSearch uses SQLite (not flat files) for the file index at scale.
/// Plain text/binary files are efficient for append-only logs but cannot
/// support fast filename search, prefix deletes, or concurrent read/write
/// without rebuilding an in-memory structure — which defeats the memory goal.
/// </summary>
internal static class IndexStoragePolicy
{
    public const string DatabaseFileName = "index.db";

    public const int BulkMergeBatchSize = 16_384;
    public const int SqliteInsertChunkSize = 512;
    public const int RegexSearchPageSize = 20_000;
    public const int FtsCandidateLimit = 2000;
    public const int MaxSearchResults = 2000;

    public const long SqliteMmapBytes = 256L * 1024 * 1024;
    public const int SqliteCachePages = -65536;
}
