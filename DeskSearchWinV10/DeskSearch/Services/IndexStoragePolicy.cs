namespace DeskSearch.Services;

/// <summary>
/// DeskSearch uses SQLite (not flat files) for the file index at scale.
/// Plain text/binary files are efficient for append-only logs but cannot
/// support fast filename search, prefix deletes, or concurrent read/write
/// without rebuilding an in-memory structure — which defeats the memory goal.
/// </summary>
internal static class IndexStoragePolicy
{
    /// <summary>Completed search index (<c>index.db</c>). Exists only after a successful full index build.</summary>
    public const string DatabaseFileName = "index.db";

    /// <summary>Build index (<c>index.building.db</c>) for every full scan. On success it replaces
    /// <see cref="DatabaseFileName"/> and the old file is deleted.</summary>
    public const string BuildingDatabaseFileName = "index.building.db";

    public const int BulkMergeBatchSize = 4_096;
    public const int SqliteInsertChunkSize = 256;
    public const int RegexSearchPageSize = 20_000;
    public const int MaxSearchResults = 2000;

    /// <summary>
    /// Requests the largest mmap SQLite will allow. SQLite clamps this internally to
    /// whatever SQLITE_MAX_MMAP_SIZE / available address space actually supports (64-bit
    /// process, so effectively "the whole database file" for any realistic index size) —
    /// there's no downside to asking for the theoretical max.
    /// </summary>
    public const long SqliteMmapBytes = long.MaxValue;

    // mmap already covers most read-only page access at ~2 GiB above; cache_size mainly
    // matters for hot index B-tree pages and (with temp_store=MEMORY) query temp tables
    // used when sorting/scoring large candidate sets — both matter more as the index grows
    // into the millions of rows, where search latency is the priority over memory use.
    public const int SqliteCachePages = -131_072; // 128 MiB
    public const int BulkIngestCachePages = -65_536; // 64 MiB
}
