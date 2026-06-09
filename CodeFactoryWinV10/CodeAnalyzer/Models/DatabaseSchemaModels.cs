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
    /// <summary>EF Core DbSet 속성명 등 코드에서 테이블을 찾을 때 쓰는 별칭.</summary>
    public IReadOnlyList<string> AccessAliases { get; init; } = [];
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

/// <summary>데이터베이스 인스턴스(카탈로그·SQLite 파일·연결 대상).</summary>
public sealed class DatabaseCatalog
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public DatabaseDialect Dialect { get; init; }
    /// <summary>connection-string, sqlite-file, sql-use, inferred 등.</summary>
    public string SourceKind { get; init; } = string.Empty;
    public string? FilePath { get; init; }
    public int LineNumber { get; init; }
}

public enum DatabaseCatalogAccessKind
{
    Connect,
    Select,
    Admin
}

public enum DatabaseCatalogAccessPattern
{
    Sql,
    ConnectionString,
    Api
}

public sealed class DatabaseCatalogAccess
{
    public required string CatalogId { get; init; }
    public required string FunctionId { get; init; }
    public required string FunctionDisplayName { get; init; }
    public required string FunctionFullName { get; init; }
    public required string FunctionFilePath { get; init; }
    public int FunctionLineNumber { get; init; }
    public DatabaseCatalogAccessKind Kind { get; init; }
    public DatabaseCatalogAccessPattern Pattern { get; init; }
    public DatabaseCrudOperation Operations { get; init; }
}

public sealed class DatabaseSchemaResult
{
    public IReadOnlyList<DatabaseCatalog> Catalogs { get; init; } = [];
    public IReadOnlyList<DatabaseTable> Tables { get; init; } = [];
    public IReadOnlyList<DatabaseRelation> Relations { get; init; } = [];
    public IReadOnlyList<DatabaseCatalogAccess> CatalogAccesses { get; init; } = [];
    public IReadOnlyList<DatabaseTableAccess> Accesses { get; init; } = [];
    public IReadOnlyList<DatabaseColumnAccess> ColumnAccesses { get; init; } = [];
    public IReadOnlyList<DatabaseEntryAccess> EntryAccesses { get; init; } = [];

    public IReadOnlyDictionary<string, DatabaseCatalog> CatalogMap { get; init; }
        = new Dictionary<string, DatabaseCatalog>(StringComparer.OrdinalIgnoreCase);

    public IReadOnlyDictionary<string, DatabaseTable> TableMap { get; init; }
        = new Dictionary<string, DatabaseTable>(StringComparer.OrdinalIgnoreCase);

    public IReadOnlyDictionary<string, IReadOnlyList<DatabaseCatalogAccess>> CatalogAccessesByCatalogId { get; init; }
        = new Dictionary<string, IReadOnlyList<DatabaseCatalogAccess>>(StringComparer.OrdinalIgnoreCase);

    public IReadOnlyDictionary<string, IReadOnlyList<DatabaseTableAccess>> AccessesByTableId { get; init; }
        = new Dictionary<string, IReadOnlyList<DatabaseTableAccess>>(StringComparer.OrdinalIgnoreCase);

    public IReadOnlyDictionary<string, IReadOnlyList<DatabaseColumnAccess>> ColumnAccessesByTableId { get; init; }
        = new Dictionary<string, IReadOnlyList<DatabaseColumnAccess>>(StringComparer.OrdinalIgnoreCase);

    public IReadOnlyDictionary<string, IReadOnlyList<DatabaseEntryAccess>> EntryAccessesByTableId { get; init; }
        = new Dictionary<string, IReadOnlyList<DatabaseEntryAccess>>(StringComparer.OrdinalIgnoreCase);

    public IReadOnlyList<DatabaseCatalogAccess> GetCatalogAccessesFor(string catalogId) =>
        CatalogAccessesByCatalogId.TryGetValue(catalogId, out var accesses) ? accesses : [];

    public IReadOnlyList<DatabaseTableAccess> GetAccessesFor(string tableId) =>
        AccessesByTableId.TryGetValue(tableId, out var accesses) ? accesses : [];

    public IReadOnlyList<DatabaseColumnAccess> GetColumnAccessesFor(string tableId) =>
        ColumnAccessesByTableId.TryGetValue(tableId, out var accesses) ? accesses : [];

    public IReadOnlyList<DatabaseEntryAccess> GetEntryAccessesFor(string tableId) =>
        EntryAccessesByTableId.TryGetValue(tableId, out var accesses) ? accesses : [];
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

/// <summary>CRUD(Create/Read/Update/Delete) 세부 동작. 한 접근에서 여러 동작이 함께 검출될 수 있어 플래그로 표현.</summary>
[Flags]
public enum DatabaseCrudOperation
{
    None = 0,
    /// <summary>INSERT / CREATE TABLE / EF Add 등 새 데이터·스키마 생성.</summary>
    Create = 1 << 0,
    /// <summary>SELECT / FROM·JOIN / EF Find·Where·ToList 등 조회.</summary>
    Read = 1 << 1,
    /// <summary>UPDATE / ALTER TABLE / EF Update·ExecuteUpdate 등 변경.</summary>
    Update = 1 << 2,
    /// <summary>DELETE / DROP·TRUNCATE TABLE / EF Remove·ExecuteDelete 등 삭제.</summary>
    Delete = 1 << 3
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
    /// <summary>이 접근에서 검출된 세부 CRUD 동작 (검출 불가 시 None).</summary>
    public DatabaseCrudOperation Operations { get; init; }
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
    /// <summary>이 필드 접근에서 검출된 세부 CRUD 동작 (검출 불가 시 None).</summary>
    public DatabaseCrudOperation Operations { get; init; }
}

/// <summary>테이블의 개별 데이터 행(엔트리)에 대한 CRUD 동작 단위 기록.</summary>
public sealed class DatabaseEntryAccess
{
    public required string TableId { get; init; }
    public required string FunctionId { get; init; }
    public required string FunctionDisplayName { get; init; }
    public required string FunctionFullName { get; init; }
    public required string FunctionFilePath { get; init; }
    public int FunctionLineNumber { get; init; }
    public DatabaseCrudOperation Operation { get; init; }
    public DatabaseTableAccessPattern Pattern { get; init; }
}
