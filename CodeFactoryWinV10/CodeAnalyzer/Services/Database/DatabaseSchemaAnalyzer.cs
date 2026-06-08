using CodeAnalyzer.Models;
using CodeAnalyzer.Services.Database.Schema;

namespace CodeAnalyzer.Services.Database;

public sealed class DatabaseSchemaAnalyzer
{
    private readonly CSharpEfCoreSchemaExtractor _efExtractor = new();

    public async Task<DatabaseSchemaResult> AnalyzeAsync(
        IReadOnlyList<string> sourceFiles,
        Dictionary<string, List<string>> filesByLanguage,
        HashSet<string> enabledLanguageIds,
        CancellationToken cancellationToken = default)
    {
        var parsedTables = new Dictionary<string, SqlSchemaParser.ParsedTable>(StringComparer.OrdinalIgnoreCase);

        var sqlScripts = SqlFileSchemaExtractor.CollectScripts(sourceFiles, cancellationToken);
        sqlScripts = sqlScripts
            .Concat(SqlInCodeSchemaExtractor.ExtractFromSourceFiles(sourceFiles, cancellationToken))
            .ToList();

        foreach (var table in SqlSchemaParser.ParseScripts(sqlScripts))
        {
            parsedTables.TryAdd(table.Key, table);
        }

        if (filesByLanguage.TryGetValue("csharp", out var csharpFiles)
            && enabledLanguageIds.Contains("csharp")
            && csharpFiles.Count > 0)
        {
            var efTables = await _efExtractor.ExtractAsync(csharpFiles, cancellationToken).ConfigureAwait(false);
            foreach (var (key, table) in efTables)
            {
                if (parsedTables.TryGetValue(key, out var existing))
                {
                    parsedTables[key] = MergeTables(existing, table);
                }
                else
                {
                    parsedTables[key] = table;
                }
            }
        }

        return BuildResult(parsedTables);
    }

    private static SqlSchemaParser.ParsedTable MergeTables(
        SqlSchemaParser.ParsedTable sql,
        SqlSchemaParser.ParsedTable ef)
    {
        if (sql.Columns.Count >= ef.Columns.Count)
        {
        foreach (var fk in ef.ForeignKeys)
        {
            if (!sql.ForeignKeys.Any(f =>
                    string.Equals(f.Column, fk.Column, StringComparison.OrdinalIgnoreCase)))
            {
                sql.ForeignKeys.Add(fk);
            }
        }

        foreach (var alias in ef.DbSetPropertyNames)
        {
            if (!sql.DbSetPropertyNames.Contains(alias, StringComparer.OrdinalIgnoreCase))
            {
                sql.DbSetPropertyNames.Add(alias);
            }
        }

        return sql;
        }

        foreach (var col in sql.Columns)
        {
            if (!ef.Columns.Any(c => string.Equals(c.Name, col.Name, StringComparison.OrdinalIgnoreCase)))
            {
                ef.Columns.Add(col);
            }
        }

        foreach (var fk in sql.ForeignKeys)
        {
            if (!ef.ForeignKeys.Any(f =>
                    string.Equals(f.Column, fk.Column, StringComparison.OrdinalIgnoreCase)))
            {
                ef.ForeignKeys.Add(fk);
            }
        }

        foreach (var alias in sql.DbSetPropertyNames)
        {
            if (!ef.DbSetPropertyNames.Contains(alias, StringComparer.OrdinalIgnoreCase))
            {
                ef.DbSetPropertyNames.Add(alias);
            }
        }

        return ef;
    }

    private static DatabaseSchemaResult BuildResult(Dictionary<string, SqlSchemaParser.ParsedTable> parsedTables)
    {
        var tables = new List<DatabaseTable>();
        var relations = new List<DatabaseRelation>();
        var tableByName = new Dictionary<string, DatabaseTable>(StringComparer.OrdinalIgnoreCase);

        foreach (var parsed in parsedTables.Values.OrderBy(t => t.Name, StringComparer.OrdinalIgnoreCase))
        {
            var id = $"table:{parsed.Key}";
            var columns = parsed.Columns.Select(col => new DatabaseColumn
            {
                Name = col.Name,
                DataType = col.DataType,
                IsPrimaryKey = col.IsPrimaryKey,
                IsForeignKey = col.ReferencedTable is not null
                    || parsed.ForeignKeys.Any(fk =>
                        string.Equals(fk.Column, col.Name, StringComparison.OrdinalIgnoreCase)),
                IsNullable = col.IsNullable,
                ReferencedTable = col.ReferencedTable,
                ReferencedColumn = col.ReferencedColumn
            }).ToList();

            var table = new DatabaseTable
            {
                Id = id,
                Name = parsed.Name,
                Schema = parsed.Schema,
                EntityTypeName = parsed.EntityTypeName,
                Dialect = parsed.Dialect,
                SourceKind = string.IsNullOrWhiteSpace(parsed.FilePath) ? "inferred" : Path.GetExtension(parsed.FilePath) switch
                {
                    ".sql" or ".mysql" or ".pgsql" => "sql-script",
                    ".cs" => "ef-core",
                    _ => "sql-in-code"
                },
                FilePath = parsed.FilePath,
                LineNumber = parsed.LineNumber,
                AccessAliases = parsed.DbSetPropertyNames,
                Columns = columns
            };

            tables.Add(table);
            tableByName[parsed.Name] = table;
            if (!string.IsNullOrWhiteSpace(parsed.Schema))
            {
                tableByName[$"{parsed.Schema}.{parsed.Name}"] = table;
            }
        }

        foreach (var parsed in parsedTables.Values)
        {
            if (!tableByName.TryGetValue(parsed.Name, out var fromTable))
            {
                continue;
            }

            foreach (var fk in parsed.ForeignKeys)
            {
                if (!TryResolveTable(tableByName, fk.ReferencedTable, out var toTable))
                {
                    continue;
                }

                relations.Add(new DatabaseRelation
                {
                    FromTableId = fromTable.Id,
                    ToTableId = toTable.Id,
                    FromColumn = fk.Column,
                    ToColumn = fk.ReferencedColumn,
                    Kind = DatabaseRelationKind.ForeignKey,
                    Label = fk.Column
                });
            }

            foreach (var col in parsed.Columns.Where(c => c.ReferencedTable is not null))
            {
                if (!TryResolveTable(tableByName, col.ReferencedTable!, out var toTable))
                {
                    continue;
                }

                if (relations.Any(r =>
                        r.FromTableId == fromTable.Id
                        && r.ToTableId == toTable.Id
                        && string.Equals(r.FromColumn, col.Name, StringComparison.OrdinalIgnoreCase)))
                {
                    continue;
                }

                relations.Add(new DatabaseRelation
                {
                    FromTableId = fromTable.Id,
                    ToTableId = toTable.Id,
                    FromColumn = col.Name,
                    ToColumn = col.ReferencedColumn ?? "id",
                    Kind = DatabaseRelationKind.ForeignKey,
                    Label = col.Name
                });
            }
        }

        return new DatabaseSchemaResult
        {
            Tables = tables,
            Relations = relations,
            TableMap = tables.ToDictionary(t => t.Id, StringComparer.OrdinalIgnoreCase)
        };
    }

    private static bool TryResolveTable(
        Dictionary<string, DatabaseTable> tableByName,
        string referencedName,
        out DatabaseTable table)
    {
        if (tableByName.TryGetValue(referencedName, out table!))
        {
            return true;
        }

        var simple = referencedName.Contains('.')
            ? referencedName[(referencedName.LastIndexOf('.') + 1)..]
            : referencedName;

        return tableByName.TryGetValue(simple, out table!);
    }
}
