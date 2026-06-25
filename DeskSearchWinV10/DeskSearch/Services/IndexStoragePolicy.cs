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
    public const string BuildingDatabaseFileName = "index.building.db";

    public const int BulkMergeBatchSize = 4_096;
    public const int SqliteInsertChunkSize = 256;
    public const int RegexSearchPageSize = 20_000;
    public const int MaxSearchResults = 2000;

    /// <summary>
    /// SQLite PRAGMA mmap_size upper bound (SQLITE_MAX_MMAP_SIZE on 64-bit Windows).
    /// </summary>
    public const long SqliteMmapBytes = 0x7fff0000L; // 2,147,418,112 bytes (~2 GiB)
    public const int SqliteCachePages = -8192;
    public const int BulkIngestCachePages = -16384;
}
