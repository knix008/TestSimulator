namespace CodeAnalyzer.Models;

public enum DatabaseDialect
{
    Unknown,
    MySql,
    MariaDb,
    PostgreSql,
    Sqlite
}

public enum DatabaseRelationKind
{
    ForeignKey,
    InferredReference
}

public sealed class DatabaseColumn
{
    public required string Name { get; init; }
    public string DataType { get; init; } = string.Empty;
    public bool IsPrimaryKey { get; init; }
    public bool IsForeignKey { get; init; }
    public bool IsNullable { get; init; } = true;
    public string? ReferencedTable { get; init; }
    public string? ReferencedColumn { get; init; }
}

public sealed class DatabaseTable
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public string? Schema { get; init; }
    public DatabaseDialect Dialect { get; init; }
    public string SourceKind { get; init; } = string.Empty;
    public string FilePath { get; init; } = string.Empty;
    public int LineNumber { get; init; }
    public IReadOnlyList<DatabaseColumn> Columns { get; init; } = [];
}

public sealed class DatabaseRelation
{
    public required string FromTableId { get; init; }
    public required string ToTableId { get; init; }
    public string? FromColumn { get; init; }
    public string? ToColumn { get; init; }
    public DatabaseRelationKind Kind { get; init; }
    public string Label { get; init; } = string.Empty;
}

public sealed class DatabaseSchemaResult
{
    public IReadOnlyList<DatabaseTable> Tables { get; init; } = [];
    public IReadOnlyList<DatabaseRelation> Relations { get; init; } = [];

    public IReadOnlyDictionary<string, DatabaseTable> TableMap { get; init; }
        = new Dictionary<string, DatabaseTable>(StringComparer.OrdinalIgnoreCase);
}
