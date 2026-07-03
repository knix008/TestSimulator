using System.Text;
using DeskSearch.Helpers;
using DeskSearch.Models;
using Microsoft.Data.Sqlite;

namespace DeskSearch.Services;

public sealed partial class IndexStore : IDisposable
{
    private const int SchemaVersion = 7;

    private readonly SqliteConnection _connection;
    private readonly object _lock = new();
    private long _cachedCount = -1;
    private int _bulkIngestDepth;
    private SqliteCommand? _bulkUpsertCommand;
    private int _bulkUpsertCommandSize = -1;

    public IndexStore(string databasePath)
    {
        var directory = Path.GetDirectoryName(databasePath);
        if (!string.IsNullOrEmpty(directory))
            Directory.CreateDirectory(directory);

        _connection = new SqliteConnection($"Data Source={databasePath};Mode=ReadWriteCreate;Cache=Shared");
        _connection.Open();
        InitializeDatabase();
    }

    public int Count
    {
        get
        {
            lock (_lock)
                return (int)GetCountLocked();
        }
    }

    public bool NeedsFtsMigration
    {
        get
        {
            lock (_lock)
                return GetUserVersion() < SchemaVersion;
        }
    }

    public void RunFtsMigration(Action<int>? onProgress = null, CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            if (GetUserVersion() >= SchemaVersion)
                return;

            RecreateFtsIndexWithProgressLocked(onProgress, cancellationToken);
            ExecuteNonQuery("ANALYZE");
            ExecuteNonQuery($"PRAGMA user_version = {SchemaVersion}");
        }
    }

    // FTS triggers stay live through bulk ingest (unlike the old design, which dropped
    // them and rebuilt once at the end) so every literal search can use the trigram
    // index immediately, even mid-scan. Indexing pays a small per-row trigger-maintenance
    // cost in exchange — an explicit trade: indexing time doesn't matter, search latency does.
    public void BeginBulkIngest()
    {
        lock (_lock)
        {
            _bulkIngestDepth++;
            if (_bulkIngestDepth != 1)
                return;

            ExecuteNonQuery("PRAGMA synchronous=NORMAL");
            ExecuteNonQuery("PRAGMA locking_mode=EXCLUSIVE");
            ExecuteNonQuery("PRAGMA temp_store=MEMORY");
            ExecuteNonQuery($"PRAGMA cache_size={IndexStoragePolicy.BulkIngestCachePages}");
        }
    }

    public void EndBulkIngest()
    {
        lock (_lock)
        {
            if (_bulkIngestDepth == 0)
                return;

            _bulkIngestDepth--;
            if (_bulkIngestDepth != 0)
                return;

            ExecuteNonQuery("PRAGMA synchronous=NORMAL");
            ExecuteNonQuery("PRAGMA locking_mode=NORMAL");
            ExecuteNonQuery("PRAGMA temp_store=MEMORY");
            ExecuteNonQuery($"PRAGMA cache_size={IndexStoragePolicy.SqliteCachePages}");
            DisposeBulkUpsertCommand();
            RefreshCountLocked();
        }
    }

    public void Clear()
    {
        lock (_lock)
        {
            ExecuteNonQuery("DELETE FROM entries");
            ExecuteNonQuery("DELETE FROM indexed_roots");
            _cachedCount = 0;
        }
    }

    public void Checkpoint()
    {
        lock (_lock)
            ExecuteNonQuery("PRAGMA wal_checkpoint(TRUNCATE)");
    }

    /// <summary>
    /// Refreshes table/index statistics so the query planner picks good plans for the
    /// trigram subquery joined against entries — worth doing once after a full rebuild,
    /// not on every small incremental update.
    /// </summary>
    public void Analyze()
    {
        lock (_lock)
            ExecuteNonQuery("ANALYZE");
    }

    public IReadOnlyCollection<string> LoadIndexedRoots()
    {
        lock (_lock)
        {
            using var command = CreateCommand("SELECT root FROM indexed_roots");
            using var reader = command.ExecuteReader();
            var roots = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            while (reader.Read())
                roots.Add(reader.GetString(0));

            return roots;
        }
    }

    public void MarkRootIndexed(string normalizedRoot)
    {
        lock (_lock)
        {
            using var command = CreateCommand("INSERT OR IGNORE INTO indexed_roots(root) VALUES ($root)");
            command.Parameters.AddWithValue("$root", normalizedRoot);
            command.ExecuteNonQuery();
        }
    }

    public void ClearIndexedRoots()
    {
        lock (_lock)
        {
            ExecuteNonQuery("DELETE FROM indexed_roots");
        }
    }

    public void PurgeIndexedRootsOutsideScope(IReadOnlyCollection<string> allowedNormalizedRoots)
    {
        lock (_lock)
        {
            var allowed = allowedNormalizedRoots as IReadOnlySet<string>
                ?? new HashSet<string>(allowedNormalizedRoots, StringComparer.OrdinalIgnoreCase);

            using var command = CreateCommand("SELECT root FROM indexed_roots");
            using var reader = command.ExecuteReader();
            var toRemove = new List<string>();

            while (reader.Read())
            {
                var root = reader.GetString(0);
                if (!allowed.Contains(root))
                    toRemove.Add(root);
            }

            foreach (var root in toRemove)
            {
                using var delete = CreateCommand("DELETE FROM indexed_roots WHERE root = $root COLLATE NOCASE");
                delete.Parameters.AddWithValue("$root", root);
                delete.ExecuteNonQuery();
            }
        }
    }

    public bool HasScanCheckpoints()
    {
        lock (_lock)
        {
            using var command = CreateCommand("SELECT 1 FROM scan_checkpoints LIMIT 1");
            return command.ExecuteScalar() is not null;
        }
    }

    public void SaveScanCheckpoint(string normalizedRoot, string lastPath)
    {
        lock (_lock)
        {
            using var command = CreateCommand(
                """
                INSERT INTO scan_checkpoints(root, last_path) VALUES ($root, $path)
                ON CONFLICT(root) DO UPDATE SET last_path = excluded.last_path
                """);
            command.Parameters.AddWithValue("$root", normalizedRoot);
            command.Parameters.AddWithValue("$path", lastPath);
            command.ExecuteNonQuery();
        }
    }

    public bool TryLoadScanCheckpoint(string normalizedRoot, out string lastPath)
    {
        lock (_lock)
        {
            using var command = CreateCommand(
                "SELECT last_path FROM scan_checkpoints WHERE root = $root COLLATE NOCASE");
            command.Parameters.AddWithValue("$root", normalizedRoot);
            var value = command.ExecuteScalar();
            if (value is string path && path.Length > 0)
            {
                lastPath = path;
                return true;
            }
        }

        lastPath = string.Empty;
        return false;
    }

    public void ClearScanCheckpoint(string normalizedRoot)
    {
        lock (_lock)
        {
            using var command = CreateCommand("DELETE FROM scan_checkpoints WHERE root = $root COLLATE NOCASE");
            command.Parameters.AddWithValue("$root", normalizedRoot);
            command.ExecuteNonQuery();
        }
    }

    public void ClearAllScanCheckpoints()
    {
        lock (_lock)
        {
            ExecuteNonQuery("DELETE FROM scan_checkpoints");
        }
    }

    public void UpsertBatch(IReadOnlyList<FileEntry> batch)
    {
        if (batch.Count == 0)
            return;

        lock (_lock)
        {
            using var transaction = _connection.BeginTransaction();
            for (var i = 0; i < batch.Count; i += IndexStoragePolicy.SqliteInsertChunkSize)
            {
                var chunkSize = Math.Min(IndexStoragePolicy.SqliteInsertChunkSize, batch.Count - i);
                UpsertChunk(batch, i, chunkSize, transaction);
            }

            transaction.Commit();

            // Invalidate rather than eagerly re-query COUNT(*) here: this runs inside
            // the write lock on every batch during scanning, and a real recount would
            // extend how long that lock — which search/UI also need — stays held.
            // The next reader that actually asks for Count pays for one recompute.
            _cachedCount = -1;
        }
    }

    public void RemovePathAndDescendants(string path)
    {
        lock (_lock)
        {
            var normalized = path.TrimEnd('\\');
            using var exact = CreateCommand("DELETE FROM entries WHERE full_path = $path COLLATE NOCASE");
            exact.Parameters.AddWithValue("$path", normalized);
            exact.ExecuteNonQuery();

            var prefix = EscapeLikePrefix(normalized.TrimEnd('\\') + "\\");
            using var descendants = CreateCommand(
                "DELETE FROM entries WHERE full_path LIKE $prefix ESCAPE '\\' COLLATE NOCASE");
            descendants.Parameters.AddWithValue("$prefix", prefix + "%");
            descendants.ExecuteNonQuery();

            _cachedCount = -1;
        }
    }

    public int PurgeOutsideScope(IndexInclusionPolicy inclusion)
    {
        lock (_lock)
        {
            var scanRoots = inclusion.ScanRoots;
            if (scanRoots.Count == 0)
            {
                using var deleteAll = CreateCommand("DELETE FROM entries");
                var removed = deleteAll.ExecuteNonQuery();
                if (removed > 0)
                    _cachedCount = -1;

                return removed;
            }

            var conditions = new List<string>();
            for (var i = 0; i < scanRoots.Count; i++)
            {
                var root = scanRoots[i].TrimEnd('\\');
                conditions.Add(
                    $"(full_path LIKE $root{i} ESCAPE '\\' COLLATE NOCASE OR full_path = $rootExact{i} COLLATE NOCASE)");
            }

            var sql = $"DELETE FROM entries WHERE NOT ({string.Join(" OR ", conditions)})";
            using var command = CreateCommand(sql);

            for (var i = 0; i < scanRoots.Count; i++)
            {
                var root = scanRoots[i].TrimEnd('\\');
                command.Parameters.AddWithValue($"$root{i}", EscapeLikePrefix(root + "\\") + "%");
                command.Parameters.AddWithValue($"$rootExact{i}", root);
            }

            var purged = command.ExecuteNonQuery();

            foreach (var excludedPrefix in inclusion.LegacyExcludedDirectoryPrefixes)
                purged += DeleteByPrefix(EscapeLikePrefix(excludedPrefix));

            if (purged > 0)
                _cachedCount = -1;

            return purged;
        }
    }

    public IndexPage ReadPageAfterId(long afterId, int limit)
    {
        lock (_lock)
        {
            using var command = CreateCommand(
                """
                SELECT id, full_path, file_name, directory, is_directory, modified_utc
                FROM entries
                WHERE id > $afterId
                ORDER BY id
                LIMIT $limit
                """);

            command.Parameters.AddWithValue("$afterId", afterId);
            command.Parameters.AddWithValue("$limit", limit);

            using var reader = command.ExecuteReader();
            var results = new List<FileEntry>(Math.Min(limit, 256));
            var lastId = afterId;

            while (reader.Read())
            {
                lastId = reader.GetInt64(0);
                results.Add(ReadEntry(reader, 1));
            }

            return new IndexPage(results, lastId);
        }
    }

    public IEnumerable<FileEntry> EnumerateAll(int pageSize)
    {
        if (pageSize <= 0)
            throw new ArgumentOutOfRangeException(nameof(pageSize));

        var lastId = 0L;
        while (true)
        {
            IndexPage page;
            lock (_lock)
                page = ReadPageAfterIdLocked(lastId, pageSize);

            if (page.Entries.Count == 0)
                yield break;

            foreach (var entry in page.Entries)
                yield return entry;

            if (page.LastId <= lastId)
                yield break;

            lastId = page.LastId;
        }
    }

    public void Dispose()
    {
        lock (_lock)
        {
            try
            {
                ExecuteNonQuery("PRAGMA wal_checkpoint(TRUNCATE)");
            }
            catch
            {
                // best effort before closing the connection
            }

            DisposeBulkUpsertCommand();
            SqliteConnection.ClearPool(_connection);
            _connection.Dispose();
        }
    }

    private IndexPage ReadPageAfterIdLocked(long afterId, int limit)
    {
        using var command = CreateCommand(
            """
            SELECT id, full_path, file_name, directory, is_directory, modified_utc
            FROM entries
            WHERE id > $afterId
            ORDER BY id
            LIMIT $limit
            """);

        command.Parameters.AddWithValue("$afterId", afterId);
        command.Parameters.AddWithValue("$limit", limit);

        using var reader = command.ExecuteReader();
        var results = new List<FileEntry>(Math.Min(limit, 256));
        var lastId = afterId;

        while (reader.Read())
        {
            lastId = reader.GetInt64(0);
            results.Add(ReadEntry(reader, 1));
        }

        return new IndexPage(results, lastId);
    }

    private void UpsertChunk(
        IReadOnlyList<FileEntry> batch,
        int start,
        int count,
        SqliteTransaction transaction)
    {
        var command = GetOrCreateBulkUpsertCommand(count, transaction);
        command.Parameters.Clear();

        for (var j = 0; j < count; j++)
        {
            var entry = batch[start + j];
            command.Parameters.AddWithValue($"$fp{j}", entry.FullPath);
            command.Parameters.AddWithValue($"$fn{j}", entry.FileName);
            command.Parameters.AddWithValue($"$dir{j}", entry.Directory);
            command.Parameters.AddWithValue($"$isd{j}", entry.IsDirectory ? 1 : 0);
            command.Parameters.AddWithValue($"$sfn{j}", entry.SearchFileName);
            command.Parameters.AddWithValue($"$sdn{j}", entry.SearchDirectoryName);
            command.Parameters.AddWithValue($"$sfp{j}", string.Empty);
            command.Parameters.AddWithValue($"$mut{j}", entry.ModifiedUtc);
        }

        command.ExecuteNonQuery();
    }

    private SqliteCommand GetOrCreateBulkUpsertCommand(int count, SqliteTransaction transaction)
    {
        if (_bulkUpsertCommand is not null && _bulkUpsertCommandSize == count)
        {
            _bulkUpsertCommand.Transaction = transaction;
            return _bulkUpsertCommand;
        }

        DisposeBulkUpsertCommand();
        _bulkUpsertCommand = CreateCommand(BuildUpsertChunkSql(count), transaction);
        _bulkUpsertCommandSize = count;
        return _bulkUpsertCommand;
    }

    private void DisposeBulkUpsertCommand()
    {
        _bulkUpsertCommand?.Dispose();
        _bulkUpsertCommand = null;
        _bulkUpsertCommandSize = -1;
    }

    private static string BuildUpsertChunkSql(int count)
    {
        var builder = new StringBuilder(512 + count * 48);
        builder.Append(
            """
            INSERT INTO entries(
                full_path, file_name, directory, is_directory,
                search_file_name, search_directory, search_full_path, modified_utc)
            VALUES 
            """);

        for (var j = 0; j < count; j++)
        {
            if (j > 0)
                builder.Append(',');

            builder.Append(
                $"($fp{j},$fn{j},$dir{j},$isd{j},$sfn{j},$sdn{j},$sfp{j},$mut{j})");
        }

        builder.Append(
            """
             ON CONFLICT(full_path) DO UPDATE SET
                file_name = excluded.file_name,
                directory = excluded.directory,
                is_directory = excluded.is_directory,
                search_file_name = excluded.search_file_name,
                search_directory = excluded.search_directory,
                search_full_path = excluded.search_full_path,
                modified_utc = excluded.modified_utc
             WHERE entries.file_name != excluded.file_name
                OR entries.directory != excluded.directory
                OR entries.is_directory != excluded.is_directory
                OR entries.search_file_name != excluded.search_file_name
                OR entries.search_directory != excluded.search_directory
                OR entries.search_full_path != excluded.search_full_path
                OR entries.modified_utc != excluded.modified_utc
            """);

        return builder.ToString();
    }

    private void InitializeDatabase()
    {
        lock (_lock)
        {
            ExecuteNonQuery("PRAGMA journal_mode=WAL");
            ExecuteNonQuery("PRAGMA synchronous=NORMAL");
            ExecuteNonQuery("PRAGMA temp_store=MEMORY");
            ExecuteNonQuery($"PRAGMA mmap_size={IndexStoragePolicy.SqliteMmapBytes}");
            ExecuteNonQuery($"PRAGMA cache_size={IndexStoragePolicy.SqliteCachePages}");
            ExecuteNonQuery(
                """
                CREATE TABLE IF NOT EXISTS entries(
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    full_path TEXT NOT NULL UNIQUE COLLATE NOCASE,
                    file_name TEXT NOT NULL,
                    directory TEXT NOT NULL,
                    is_directory INTEGER NOT NULL,
                    search_file_name TEXT NOT NULL,
                    search_directory TEXT NOT NULL,
                    search_full_path TEXT NOT NULL,
                    modified_utc INTEGER NOT NULL DEFAULT 0
                )
                """);
            ExecuteNonQuery(
                """
                CREATE TABLE IF NOT EXISTS indexed_roots(
                    root TEXT PRIMARY KEY COLLATE NOCASE
                )
                """);
            ExecuteNonQuery(
                """
                CREATE TABLE IF NOT EXISTS scan_checkpoints(
                    root TEXT PRIMARY KEY COLLATE NOCASE,
                    last_path TEXT NOT NULL
                )
                """);
            ExecuteNonQuery(
                "CREATE INDEX IF NOT EXISTS idx_entries_search_file_name ON entries(search_file_name)");
            ExecuteNonQuery(
                "CREATE INDEX IF NOT EXISTS idx_entries_search_file_name_nocase ON entries(search_file_name COLLATE NOCASE)");
            ExecuteNonQuery(
                "CREATE INDEX IF NOT EXISTS idx_entries_search_directory_nocase ON entries(search_directory COLLATE NOCASE)");

            var version = GetUserVersion();
            if (version < 5)
            {
                if (version < 1)
                    EnsureFtsIndex();

                if (version < 3)
                    MigrateSearchDirectoryNamesLocked(rebuildFts: version >= 4);

                if (version < 4)
                    MigrateSearchScopeLocked();

                if (version < 5)
                    ScrubSearchDirectoryPathsLocked();

                ExecuteNonQuery("PRAGMA user_version = 5");
            }

            // Rebuilding the trigram FTS index (schema version 6) walks every indexed
            // entry and can take a while on large indexes, so it is deferred to
            // RunFtsMigration() — the caller runs it only after the user confirms.

            if (version >= 6 && version < 7)
            {
                EnsureModifiedUtcColumnLocked();
                ExecuteNonQuery("PRAGMA user_version = 7");
            }
        }
    }

    private void EnsureModifiedUtcColumnLocked()
    {
        using var command = CreateCommand("PRAGMA table_info(entries)");
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            if (string.Equals(reader.GetString(1), "modified_utc", StringComparison.OrdinalIgnoreCase))
                return;
        }

        ExecuteNonQuery("ALTER TABLE entries ADD COLUMN modified_utc INTEGER NOT NULL DEFAULT 0");
    }

    private void MigrateSearchDirectoryNamesLocked(bool rebuildFts = true)
    {
        const int batchSize = 4096;
        long lastId = 0;

        while (true)
        {
            using var select = CreateCommand(
                """
                SELECT id, directory, search_directory
                FROM entries
                WHERE id > $lastId
                ORDER BY id
                LIMIT $limit
                """);
            select.Parameters.AddWithValue("$lastId", lastId);
            select.Parameters.AddWithValue("$limit", batchSize);

            using var reader = select.ExecuteReader();
            var updates = new List<(long Id, string SearchDirectoryName)>(batchSize);
            var rowsRead = 0;

            while (reader.Read())
            {
                rowsRead++;
                var id = reader.GetInt64(0);
                lastId = id;
                var directory = reader.GetString(1);
                var currentSearchDirectory = reader.GetString(2);
                var searchDirectoryName = SearchTextHelper.NormalizeParentDirectoryName(directory);
                if (!string.Equals(currentSearchDirectory, searchDirectoryName, StringComparison.Ordinal))
                    updates.Add((id, searchDirectoryName));
            }

            if (rowsRead == 0)
                break;

            foreach (var (id, searchDirectoryName) in updates)
            {
                using var update = CreateCommand(
                    "UPDATE entries SET search_directory = $name WHERE id = $id");
                update.Parameters.AddWithValue("$name", searchDirectoryName);
                update.Parameters.AddWithValue("$id", id);
                update.ExecuteNonQuery();
            }
        }

        if (rebuildFts && GetCountLocked() > 0)
            RebuildFts();
    }

    private void MigrateSearchScopeLocked()
    {
        MigrateSearchDirectoryNamesLocked(rebuildFts: false);
        ExecuteNonQuery("UPDATE entries SET search_full_path = ''");
        RecreateFtsIndexLocked();
    }

    private void ScrubSearchDirectoryPathsLocked()
    {
        MigrateSearchDirectoryNamesLocked(rebuildFts: false);
        ExecuteNonQuery(
            """
            UPDATE entries
            SET search_directory = ''
            WHERE search_directory LIKE '%\%' ESCAPE '\'
               OR search_directory LIKE '%/%' ESCAPE '\'
            """);

        if (GetCountLocked() > 0)
            RebuildFts();
    }

    private void RecreateFtsIndexLocked()
    {
        DropFtsTriggers();
        ExecuteNonQuery("DROP TABLE IF EXISTS entries_fts");
        ExecuteNonQuery(
            """
            CREATE VIRTUAL TABLE entries_fts USING fts5(
                search_file_name,
                content='entries',
                content_rowid='id',
                tokenize='trigram case_sensitive 0'
            )
            """);

        RefreshFtsTriggers();

        if (GetCountLocked() > 0)
            RebuildFts();
    }

    private void RecreateFtsIndexWithProgressLocked(Action<int>? onProgress, CancellationToken cancellationToken)
    {
        DropFtsTriggers();
        ExecuteNonQuery("DROP TABLE IF EXISTS entries_fts");
        ExecuteNonQuery(
            """
            CREATE VIRTUAL TABLE entries_fts USING fts5(
                search_file_name,
                content='entries',
                content_rowid='id',
                tokenize='trigram case_sensitive 0'
            )
            """);

        var total = GetCountLocked();
        if (total > 0)
            PopulateFtsIndexLocked(total, onProgress, cancellationToken);

        RefreshFtsTriggers();
        onProgress?.Invoke(100);
    }

    private void PopulateFtsIndexLocked(long total, Action<int>? onProgress, CancellationToken cancellationToken)
    {
        const int batchSize = 5000;
        long lastId = 0;
        long processed = 0;
        var lastReportedPercent = -1;

        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var batch = new List<(long Id, string Name)>(batchSize);
            using (var select = CreateCommand(
                """
                SELECT id, search_file_name
                FROM entries
                WHERE id > $lastId
                ORDER BY id
                LIMIT $batchSize
                """))
            {
                select.Parameters.AddWithValue("$lastId", lastId);
                select.Parameters.AddWithValue("$batchSize", batchSize);

                using var reader = select.ExecuteReader();
                while (reader.Read())
                    batch.Add((reader.GetInt64(0), reader.GetString(1)));
            }

            if (batch.Count == 0)
                break;

            using (var transaction = _connection.BeginTransaction())
            {
                using var insert = CreateCommand(
                    "INSERT INTO entries_fts(rowid, search_file_name) VALUES ($id, $name)",
                    transaction);
                var idParam = insert.Parameters.Add("$id", SqliteType.Integer);
                var nameParam = insert.Parameters.Add("$name", SqliteType.Text);

                foreach (var (id, name) in batch)
                {
                    idParam.Value = id;
                    nameParam.Value = name;
                    insert.ExecuteNonQuery();
                }

                transaction.Commit();
            }

            lastId = batch[^1].Id;
            processed += batch.Count;

            var percent = (int)Math.Min(99, processed * 100 / total);
            if (percent != lastReportedPercent)
            {
                lastReportedPercent = percent;
                onProgress?.Invoke(percent);
            }
        }
    }

    private void EnsureFtsIndex()
    {
        ExecuteNonQuery(
            """
            CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
                search_file_name,
                content='entries',
                content_rowid='id',
                tokenize='trigram case_sensitive 0'
            )
            """);

        RefreshFtsTriggers();

        if (GetCountLocked() > 0)
            RebuildFts();
    }

    private void RefreshFtsTriggers()
    {
        DropFtsTriggers();

        ExecuteNonQuery(
            """
            CREATE TRIGGER entries_fts_insert AFTER INSERT ON entries BEGIN
                INSERT INTO entries_fts(rowid, search_file_name)
                VALUES (new.id, new.search_file_name);
            END
            """);

        ExecuteNonQuery(
            """
            CREATE TRIGGER entries_fts_delete AFTER DELETE ON entries BEGIN
                INSERT INTO entries_fts(entries_fts, rowid, search_file_name)
                VALUES ('delete', old.id, old.search_file_name);
            END
            """);

        ExecuteNonQuery(
            """
            CREATE TRIGGER entries_fts_update AFTER UPDATE ON entries
            WHEN old.search_file_name != new.search_file_name
            BEGIN
                INSERT INTO entries_fts(entries_fts, rowid, search_file_name)
                VALUES ('delete', old.id, old.search_file_name);
                INSERT INTO entries_fts(rowid, search_file_name)
                VALUES (new.id, new.search_file_name);
            END
            """);
    }

    private void DropFtsTriggers()
    {
        ExecuteNonQuery("DROP TRIGGER IF EXISTS entries_fts_insert");
        ExecuteNonQuery("DROP TRIGGER IF EXISTS entries_fts_delete");
        ExecuteNonQuery("DROP TRIGGER IF EXISTS entries_fts_update");
    }

    private void RebuildFts()
    {
        ExecuteNonQuery("INSERT INTO entries_fts(entries_fts) VALUES ('rebuild')");
    }

    private int GetUserVersion()
    {
        using var command = CreateCommand("PRAGMA user_version");
        return Convert.ToInt32(command.ExecuteScalar());
    }

    private static List<FileEntry> ReadEntries(SqliteDataReader reader, int capacity)
    {
        var results = new List<FileEntry>(Math.Min(capacity, 64));

        while (reader.Read())
            results.Add(ReadEntry(reader, 0));

        return results;
    }

    private static FileEntry ReadEntry(SqliteDataReader reader, int pathOrdinal)
    {
        var modified = reader.FieldCount > pathOrdinal + 4 && !reader.IsDBNull(pathOrdinal + 4)
            ? reader.GetInt64(pathOrdinal + 4)
            : 0L;

        return new FileEntry(
            reader.GetString(pathOrdinal),
            reader.GetString(pathOrdinal + 1),
            reader.GetString(pathOrdinal + 2),
            reader.GetInt32(pathOrdinal + 3) != 0,
            modified);
    }

    private long GetCountLocked()
    {
        if (_cachedCount >= 0)
            return _cachedCount;

        RefreshCountLocked();
        return _cachedCount;
    }

    private void RefreshCountLocked()
    {
        using var command = CreateCommand("SELECT COUNT(*) FROM entries");
        _cachedCount = (long)(command.ExecuteScalar() ?? 0L);
    }

    public void RefreshCachedCount()
    {
        lock (_lock)
            RefreshCountLocked();
    }

    private int DeleteByPrefix(string escapedPrefix)
    {
        using var command = CreateCommand(
            "DELETE FROM entries WHERE full_path LIKE $prefix ESCAPE '\\' COLLATE NOCASE");
        command.Parameters.AddWithValue("$prefix", escapedPrefix + "%");
        return command.ExecuteNonQuery();
    }

    private void ExecuteNonQuery(string sql)
    {
        using var command = CreateCommand(sql);
        command.ExecuteNonQuery();
    }

    private SqliteCommand CreateCommand(string sql, SqliteTransaction? transaction = null)
    {
        var command = _connection.CreateCommand();
        command.CommandText = sql;
        if (transaction is not null)
            command.Transaction = transaction;

        return command;
    }

    private static string EscapeLikePrefix(string prefix) =>
        prefix.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_");
}
