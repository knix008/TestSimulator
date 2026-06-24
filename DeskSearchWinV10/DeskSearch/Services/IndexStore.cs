using System.Text;
using DeskSearch.Helpers;
using DeskSearch.Models;
using Microsoft.Data.Sqlite;

namespace DeskSearch.Services;

public sealed partial class IndexStore : IDisposable
{
    private const int SchemaVersion = 5;

    private readonly SqliteConnection _connection;
    private readonly object _lock = new();
    private long _cachedCount = -1;
    private int _bulkIngestDepth;
    private SqliteCommand? _bulkUpsertCommand;
    private int _bulkUpsertCommandSize = -1;
    private bool _ftsCurrent = true;

    public IndexStore(string databasePath)
    {
        var directory = Path.GetDirectoryName(databasePath);
        if (!string.IsNullOrEmpty(directory))
            Directory.CreateDirectory(directory);

        _connection = new SqliteConnection($"Data Source={databasePath};Mode=ReadWriteCreate;Cache=Shared");
        _connection.Open();
        InitializeDatabase();
    }

    public bool IsFtsCurrent
    {
        get
        {
            lock (_lock)
                return _ftsCurrent && _bulkIngestDepth == 0;
        }
    }

    public int Count
    {
        get
        {
            lock (_lock)
                return (int)GetCountLocked();
        }
    }

    public void BeginBulkIngest()
    {
        lock (_lock)
        {
            _bulkIngestDepth++;
            if (_bulkIngestDepth != 1)
                return;

            _ftsCurrent = false;
            DropFtsTriggers();
            ExecuteNonQuery("PRAGMA synchronous=NORMAL");
            ExecuteNonQuery("PRAGMA locking_mode=EXCLUSIVE");
            ExecuteNonQuery("PRAGMA temp_store=FILE");
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
            ExecuteNonQuery("PRAGMA temp_store=FILE");
            ExecuteNonQuery($"PRAGMA cache_size={IndexStoragePolicy.SqliteCachePages}");
            DisposeBulkUpsertCommand();
            Thread.Sleep(IndexResourcePolicy.BatchCommitDelayMs);
            RefreshFtsTriggers();
            RebuildFts();
            _ftsCurrent = true;
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
            _ftsCurrent = _bulkIngestDepth == 0;
        }
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
            RefreshCountLocked();
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

    public int PurgeExcluded(IndexExclusionPolicy exclusions)
    {
        lock (_lock)
        {
            var removed = 0;

            foreach (var driveRoot in exclusions.ExcludedDriveRoots)
                removed += DeleteByPrefix(EscapeLikePrefix(driveRoot));

            foreach (var directoryPrefix in exclusions.ExcludedDirectoryPrefixes)
                removed += DeleteByPrefix(EscapeLikePrefix(directoryPrefix));

            if (removed > 0)
                _cachedCount = -1;

            return removed;
        }
    }

    public IndexPage ReadPageAfterId(long afterId, int limit)
    {
        lock (_lock)
        {
            using var command = CreateCommand(
                """
                SELECT id, full_path, file_name, directory, is_directory
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
                results.Add(new FileEntry(
                    reader.GetString(1),
                    reader.GetString(2),
                    reader.GetString(3),
                    reader.GetInt32(4) != 0));
            }

            return new IndexPage(results, lastId);
        }
    }

    public IReadOnlyList<FileEntry> SearchLiteralFts(string query, int limit = IndexStoragePolicy.FtsCandidateLimit)
    {
        var normalized = SearchTextHelper.Normalize(query.Trim());
        if (string.IsNullOrEmpty(normalized))
            return [];

        var ftsQuery = BuildFtsQuery(normalized);
        if (ftsQuery is null)
            return [];

        lock (_lock)
        {
            if (!_ftsCurrent || _bulkIngestDepth > 0)
                return [];

            try
            {
                using var command = CreateCommand(
                    """
                    SELECT e.full_path, e.file_name, e.directory, e.is_directory
                    FROM entries_fts
                    JOIN entries e ON e.id = entries_fts.rowid
                    WHERE entries_fts MATCH $query
                    LIMIT $limit
                    """);

                command.Parameters.AddWithValue("$query", ftsQuery);
                command.Parameters.AddWithValue("$limit", limit);

                using var reader = command.ExecuteReader();
                return ReadEntries(reader, limit);
            }
            catch (SqliteException)
            {
                return [];
            }
        }
    }

    public IReadOnlyList<FileEntry> SearchLiteralFtsAnd(
        IReadOnlyList<string> terms,
        int limit = IndexStoragePolicy.FtsCandidateLimit)
    {
        if (terms.Count == 0)
            return [];

        var ftsQuery = BuildFtsAndQuery(terms);
        if (ftsQuery is null)
            return [];

        lock (_lock)
        {
            if (!_ftsCurrent || _bulkIngestDepth > 0)
                return [];

            try
            {
                using var command = CreateCommand(
                    """
                    SELECT e.full_path, e.file_name, e.directory, e.is_directory
                    FROM entries_fts
                    JOIN entries e ON e.id = entries_fts.rowid
                    WHERE entries_fts MATCH $query
                    LIMIT $limit
                    """);

                command.Parameters.AddWithValue("$query", ftsQuery);
                command.Parameters.AddWithValue("$limit", limit);

                using var reader = command.ExecuteReader();
                return ReadEntries(reader, limit);
            }
            catch (SqliteException)
            {
                return [];
            }
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
            DisposeBulkUpsertCommand();
            _connection.Dispose();
        }
    }

    private IndexPage ReadPageAfterIdLocked(long afterId, int limit)
    {
        using var command = CreateCommand(
            """
            SELECT id, full_path, file_name, directory, is_directory
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
            results.Add(new FileEntry(
                reader.GetString(1),
                reader.GetString(2),
                reader.GetString(3),
                reader.GetInt32(4) != 0));
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
                search_file_name, search_directory, search_full_path)
            VALUES 
            """);

        for (var j = 0; j < count; j++)
        {
            if (j > 0)
                builder.Append(',');

            builder.Append(
                $"($fp{j},$fn{j},$dir{j},$isd{j},$sfn{j},$sdn{j},$sfp{j})");
        }

        builder.Append(
            """
             ON CONFLICT(full_path) DO UPDATE SET
                file_name = excluded.file_name,
                directory = excluded.directory,
                is_directory = excluded.is_directory,
                search_file_name = excluded.search_file_name,
                search_directory = excluded.search_directory,
                search_full_path = excluded.search_full_path
             WHERE entries.file_name != excluded.file_name
                OR entries.directory != excluded.directory
                OR entries.is_directory != excluded.is_directory
                OR entries.search_file_name != excluded.search_file_name
                OR entries.search_directory != excluded.search_directory
                OR entries.search_full_path != excluded.search_full_path
            """);

        return builder.ToString();
    }

    private void InitializeDatabase()
    {
        lock (_lock)
        {
            ExecuteNonQuery("PRAGMA journal_mode=WAL");
            ExecuteNonQuery("PRAGMA synchronous=NORMAL");
            ExecuteNonQuery("PRAGMA temp_store=FILE");
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
                    search_full_path TEXT NOT NULL
                )
                """);
            ExecuteNonQuery(
                """
                CREATE TABLE IF NOT EXISTS indexed_roots(
                    root TEXT PRIMARY KEY COLLATE NOCASE
                )
                """);

            var version = GetUserVersion();
            if (version < SchemaVersion)
            {
                if (version < 1)
                    EnsureFtsIndex();

                if (version < 3)
                    MigrateSearchDirectoryNamesLocked(rebuildFts: version >= 4);

                if (version < 4)
                    MigrateSearchScopeLocked();

                if (version < 5)
                    ScrubSearchDirectoryPathsLocked();
                else if (version < SchemaVersion)
                    RefreshFtsTriggers();

                ExecuteNonQuery($"PRAGMA user_version = {SchemaVersion}");
            }
        }
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
                var searchDirectoryName = SearchTextHelper.Normalize(FileEntry.ResolveDirectoryName(directory));
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
                search_directory,
                content='entries',
                content_rowid='id',
                tokenize='unicode61'
            )
            """);

        RefreshFtsTriggers();

        if (GetCountLocked() > 0)
            RebuildFts();
    }

    private void EnsureFtsIndex()
    {
        ExecuteNonQuery(
            """
            CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
                search_file_name,
                search_directory,
                content='entries',
                content_rowid='id',
                tokenize='unicode61'
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
                INSERT INTO entries_fts(rowid, search_file_name, search_directory)
                VALUES (new.id, new.search_file_name, new.search_directory);
            END
            """);

        ExecuteNonQuery(
            """
            CREATE TRIGGER entries_fts_delete AFTER DELETE ON entries BEGIN
                INSERT INTO entries_fts(entries_fts, rowid, search_file_name, search_directory)
                VALUES ('delete', old.id, old.search_file_name, old.search_directory);
            END
            """);

        ExecuteNonQuery(
            """
            CREATE TRIGGER entries_fts_update AFTER UPDATE ON entries
            WHEN old.search_file_name != new.search_file_name
              OR old.search_directory != new.search_directory
            BEGIN
                INSERT INTO entries_fts(entries_fts, rowid, search_file_name, search_directory)
                VALUES ('delete', old.id, old.search_file_name, old.search_directory);
                INSERT INTO entries_fts(rowid, search_file_name, search_directory)
                VALUES (new.id, new.search_file_name, new.search_directory);
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
        {
            results.Add(new FileEntry(
                reader.GetString(0),
                reader.GetString(1),
                reader.GetString(2),
                reader.GetInt32(3) != 0));
        }

        return results;
    }

    private static string? BuildFtsAndQuery(IReadOnlyList<string> terms)
    {
        if (terms.Count == 0)
            return null;

        var groups = new List<string>(terms.Count);

        foreach (var term in terms)
        {
            var normalized = SearchTextHelper.Normalize(term.Trim());
            if (string.IsNullOrEmpty(normalized))
                return null;

            var token = EscapeFtsPhrase(normalized);
            groups.Add(
                $"(search_file_name : {token} OR search_file_name : {token}* OR search_directory : {token} OR search_directory : {token}*)");
        }

        return string.Join(" AND ", groups);
    }

    private static string? BuildFtsQuery(string normalizedQuery)
    {
        if (string.IsNullOrWhiteSpace(normalizedQuery))
            return null;

        var token = EscapeFtsPhrase(normalizedQuery);
        return $"(search_file_name : {token}* OR search_file_name : {token} OR search_directory : {token}* OR search_directory : {token})";
    }

    private static string EscapeFtsPhrase(string value) =>
        "\"" + value.Replace("\"", "\"\"", StringComparison.Ordinal) + "\"";

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
