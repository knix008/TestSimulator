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
    /// <summary>EF Core 등에서 매핑된 엔티티 타입 이름 (있을 경우).</summary>
    public string EntityTypeName { get; init; } = string.Empty;
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
    public IReadOnlyList<DatabaseTableAccess> Accesses { get; init; } = [];
    public IReadOnlyList<DatabaseColumnAccess> ColumnAccesses { get; init; } = [];

    public IReadOnlyDictionary<string, DatabaseTable> TableMap { get; init; }
        = new Dictionary<string, DatabaseTable>(StringComparer.OrdinalIgnoreCase);

    public IReadOnlyDictionary<string, IReadOnlyList<DatabaseTableAccess>> AccessesByTableId { get; init; }
        = new Dictionary<string, IReadOnlyList<DatabaseTableAccess>>(StringComparer.OrdinalIgnoreCase);

    public IReadOnlyDictionary<string, IReadOnlyList<DatabaseColumnAccess>> ColumnAccessesByTableId { get; init; }
        = new Dictionary<string, IReadOnlyList<DatabaseColumnAccess>>(StringComparer.OrdinalIgnoreCase);

    public IReadOnlyList<DatabaseTableAccess> GetAccessesFor(string tableId) =>
        AccessesByTableId.TryGetValue(tableId, out var accesses) ? accesses : [];

    public IReadOnlyList<DatabaseColumnAccess> GetColumnAccessesFor(string tableId) =>
        ColumnAccessesByTableId.TryGetValue(tableId, out var accesses) ? accesses : [];
}

public enum DatabaseTableAccessKind
{
    Read,
    Write,
    ReadWrite
}

public enum DatabaseTableAccessPattern
{
    Sql,
    EntityFramework,
    EntityType
}

public sealed class DatabaseTableAccess
{
    public required string TableId { get; init; }
    public required string FunctionId { get; init; }
    public required string FunctionDisplayName { get; init; }
    public required string FunctionFullName { get; init; }
    public required string FunctionFilePath { get; init; }
    public int FunctionLineNumber { get; init; }
    public DatabaseTableAccessKind Kind { get; init; }
    public DatabaseTableAccessPattern Pattern { get; init; }
}

public sealed class DatabaseColumnAccess
{
    public required string TableId { get; init; }
    public required string ColumnName { get; init; }
    public required string FunctionId { get; init; }
    public required string FunctionDisplayName { get; init; }
    public required string FunctionFullName { get; init; }
    public required string FunctionFilePath { get; init; }
    public int FunctionLineNumber { get; init; }
    public DatabaseTableAccessKind Kind { get; init; }
    public DatabaseTableAccessPattern Pattern { get; init; }
}
