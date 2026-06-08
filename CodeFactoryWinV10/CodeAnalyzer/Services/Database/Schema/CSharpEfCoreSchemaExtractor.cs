using System.Text.RegularExpressions;
using CodeAnalyzer.Models;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace CodeAnalyzer.Services.Database.Schema;

internal sealed class CSharpEfCoreSchemaExtractor
{
    private static readonly Regex FluentToTableRegex = new(
        @"\.ToTable\s*\(\s*""([^""]+)""",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex FluentFkRegex = new(
        @"\.HasOne\s*<[^>]+>\s*\(\)\s*\.WithMany\s*(?:\([^)]*\))?\s*\.HasForeignKey\s*\(\s*(?:e\s*=>\s*)?e\.(\w+)",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex DbSetPropertyRegex = new(
        @"DbSet\s*<\s*(\w+)\s*>\s+(\w+)\b",
        RegexOptions.Compiled);

    private static readonly Regex DbContextClassRegex = new(
        @"\bclass\s+\w+\s*:\s*[^\{]*\bDbContext\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex TableAttributeRegex = new(
        @"\[Table\s*\(\s*""([^""]+)""(?:\s*,\s*""([^""]+)"")?\s*\)\][\s\S]*?\bclass\s+(\w+)\b",
        RegexOptions.Compiled);

    private static readonly Regex EntityPropertyRegex = new(
        @"\b(?:public|internal|protected)\s+[\w<>\[\]?,\s]+\s+(\w+)\s*\{\s*get",
        RegexOptions.Compiled);

    public async Task<Dictionary<string, SqlSchemaParser.ParsedTable>> ExtractAsync(
        IReadOnlyList<string> sourceFiles,
        CancellationToken cancellationToken = default)
    {
        var tables = new Dictionary<string, SqlSchemaParser.ParsedTable>(StringComparer.OrdinalIgnoreCase);
        var dbSetPropertyByEntity = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);
        if (sourceFiles.Count == 0)
        {
            return tables;
        }

        var references = MetadataReferenceProvider.CreateReferences();
        var syntaxTrees = new List<SyntaxTree>();

        foreach (var file in sourceFiles)
        {
            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                var text = await File.ReadAllTextAsync(file, cancellationToken).ConfigureAwait(false);
                ExtractFromTextFallback(file, text, tables, dbSetPropertyByEntity);
                syntaxTrees.Add(CSharpSyntaxTree.ParseText(text, path: file, cancellationToken: cancellationToken));
            }
            catch (Exception ex) when (!AnalysisCancellation.IsCancellation(ex))
            {
                // skip
            }
        }

        if (syntaxTrees.Count == 0)
        {
            return tables;
        }

        var compilation = CSharpCompilation.Create(
            $"EfSchema_{Guid.NewGuid():N}",
            syntaxTrees,
            references,
            new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));

        foreach (var tree in syntaxTrees)
        {
            cancellationToken.ThrowIfCancellationRequested();

            try
            {
                var model = compilation.GetSemanticModel(tree);
                var root = await tree.GetRootAsync(cancellationToken).ConfigureAwait(false);
                var filePath = tree.FilePath ?? string.Empty;
                ExtractFromRoot(root, model, filePath, tables, dbSetPropertyByEntity, cancellationToken);
            }
            catch (Exception ex) when (!AnalysisCancellation.IsCancellation(ex))
            {
                // skip tree
            }
        }

        AttachDbSetPropertyNames(tables, dbSetPropertyByEntity);
        EnsureTablesForDbSetEntities(tables, dbSetPropertyByEntity);
        return tables;
    }

    private static void EnsureTablesForDbSetEntities(
        Dictionary<string, SqlSchemaParser.ParsedTable> tables,
        Dictionary<string, HashSet<string>> dbSetPropertyByEntity)
    {
        foreach (var (entityName, propertyNames) in dbSetPropertyByEntity)
        {
            var existing = tables.Values.FirstOrDefault(table =>
                string.Equals(table.EntityTypeName, entityName, StringComparison.OrdinalIgnoreCase)
                || string.Equals(table.Name, entityName, StringComparison.OrdinalIgnoreCase));
            if (existing is not null)
            {
                continue;
            }

            var key = SqlSchemaParser.BuildTableKey(null, entityName);
            tables.TryAdd(key, new SqlSchemaParser.ParsedTable
            {
                Key = key,
                Name = entityName,
                EntityTypeName = entityName,
                DbSetPropertyNames = propertyNames.ToList()
            });
        }
    }

    private static void ExtractFromTextFallback(
        string filePath,
        string text,
        Dictionary<string, SqlSchemaParser.ParsedTable> tables,
        Dictionary<string, HashSet<string>> dbSetPropertyByEntity)
    {
        if (!DbContextClassRegex.IsMatch(text)
            && !text.Contains("DbSet<", StringComparison.Ordinal)
            && !text.Contains("[Table", StringComparison.Ordinal))
        {
            return;
        }

        foreach (Match match in DbSetPropertyRegex.Matches(text))
        {
            RegisterDbSetProperty(dbSetPropertyByEntity, match.Groups[1].Value, match.Groups[2].Value);
        }

        foreach (Match match in TableAttributeRegex.Matches(text))
        {
            var tableName = match.Groups[1].Value;
            var schema = match.Groups[2].Success ? match.Groups[2].Value : null;
            var entityName = match.Groups[3].Value;
            var key = SqlSchemaParser.BuildTableKey(schema, tableName);
            if (tables.ContainsKey(key))
            {
                continue;
            }

            var classBody = match.Value;
            var columns = new List<SqlSchemaParser.ParsedColumn>();
            foreach (Match propertyMatch in EntityPropertyRegex.Matches(classBody))
            {
                var propertyName = propertyMatch.Groups[1].Value;
                if (string.Equals(propertyName, "Id", StringComparison.OrdinalIgnoreCase)
                    || propertyName.EndsWith("Id", StringComparison.Ordinal))
                {
                    columns.Add(new SqlSchemaParser.ParsedColumn
                    {
                        Name = propertyName,
                        IsPrimaryKey = string.Equals(propertyName, "Id", StringComparison.OrdinalIgnoreCase)
                    });
                }
                else
                {
                    columns.Add(new SqlSchemaParser.ParsedColumn { Name = propertyName });
                }
            }

            tables.TryAdd(key, new SqlSchemaParser.ParsedTable
            {
                Key = key,
                Schema = schema,
                Name = tableName,
                EntityTypeName = entityName,
                FilePath = filePath,
                Columns = columns
            });
        }
    }

    private static void RegisterDbSetProperty(
        Dictionary<string, HashSet<string>> dbSetPropertyByEntity,
        string entityTypeName,
        string propertyName)
    {
        if (!dbSetPropertyByEntity.TryGetValue(entityTypeName, out var propertyNames))
        {
            propertyNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            dbSetPropertyByEntity[entityTypeName] = propertyNames;
        }

        propertyNames.Add(propertyName);
    }

    private static void AttachDbSetPropertyNames(
        Dictionary<string, SqlSchemaParser.ParsedTable> tables,
        Dictionary<string, HashSet<string>> dbSetPropertyByEntity)
    {
        foreach (var table in tables.Values)
        {
            if (string.IsNullOrWhiteSpace(table.EntityTypeName))
            {
                continue;
            }

            if (!dbSetPropertyByEntity.TryGetValue(table.EntityTypeName, out var propertyNames))
            {
                continue;
            }

            foreach (var propertyName in propertyNames)
            {
                if (!table.DbSetPropertyNames.Contains(propertyName, StringComparer.OrdinalIgnoreCase))
                {
                    table.DbSetPropertyNames.Add(propertyName);
                }
            }
        }
    }

    private static void ExtractFromRoot(
        SyntaxNode root,
        SemanticModel model,
        string filePath,
        Dictionary<string, SqlSchemaParser.ParsedTable> tables,
        Dictionary<string, HashSet<string>> dbSetPropertyByEntity,
        CancellationToken cancellationToken)
    {
        var dbSetEntityNames = new Dictionary<string, string>(StringComparer.Ordinal);

        foreach (var classDecl in root.DescendantNodes().OfType<ClassDeclarationSyntax>())
        {
            cancellationToken.ThrowIfCancellationRequested();

            var classSymbol = model.GetDeclaredSymbol(classDecl, cancellationToken) as INamedTypeSymbol;
            if (classSymbol is null)
            {
                continue;
            }

            var isDbContext = InheritsDbContext(classSymbol);
            if (isDbContext)
            {
                foreach (var member in classSymbol.GetMembers().OfType<IPropertySymbol>())
                {
                    if (member.Type is not INamedTypeSymbol { IsGenericType: true } named
                        || !IsDbSetPropertyType(named))
                    {
                        continue;
                    }

                    var entityType = named.TypeArguments.FirstOrDefault() as INamedTypeSymbol;
                    if (entityType is null)
                    {
                        continue;
                    }

                    dbSetEntityNames[entityType.Name] = entityType.Name;
                    RegisterDbSetProperty(dbSetPropertyByEntity, entityType.Name, member.Name);
                }

                ExtractFluentMappings(classDecl, filePath, tables);
            }
        }

        foreach (var classDecl in root.DescendantNodes().OfType<ClassDeclarationSyntax>())
        {
            cancellationToken.ThrowIfCancellationRequested();

            var classSymbol = model.GetDeclaredSymbol(classDecl, cancellationToken) as INamedTypeSymbol;
            if (classSymbol is null || InheritsDbContext(classSymbol))
            {
                continue;
            }

            if (!LooksLikeEntity(classSymbol, dbSetEntityNames))
            {
                continue;
            }

            var tableName = ResolveTableName(classSymbol);
            var schema = ResolveSchema(classSymbol);
            var key = SqlSchemaParser.BuildTableKey(schema, tableName);
            var line = classDecl.GetLocation().GetLineSpan().StartLinePosition.Line + 1;
            var columns = new List<SqlSchemaParser.ParsedColumn>();
            var foreignKeys = new List<SqlSchemaParser.ParsedForeignKey>();

            foreach (var member in classSymbol.GetMembers().OfType<IPropertySymbol>())
            {
                if (member.IsStatic)
                {
                    continue;
                }

                var columnName = ResolveColumnName(member);
                var isPk = HasAttribute(member, "Key") || string.Equals(columnName, "id", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(columnName, $"{tableName}Id", StringComparison.OrdinalIgnoreCase);
                var fkAttr = GetForeignKeyInfo(member);
                var isFk = fkAttr is not null;

                columns.Add(new SqlSchemaParser.ParsedColumn
                {
                    Name = columnName,
                    DataType = member.Type.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat),
                    IsPrimaryKey = isPk,
                    IsNullable = member.NullableAnnotation == NullableAnnotation.Annotated,
                    ReferencedTable = fkAttr?.RefTable,
                    ReferencedColumn = fkAttr?.RefColumn
                });

                if (isFk && fkAttr is not null)
                {
                    foreignKeys.Add(new SqlSchemaParser.ParsedForeignKey
                    {
                        Column = columnName,
                        ReferencedTable = fkAttr.Value.RefTable,
                        ReferencedColumn = fkAttr.Value.RefColumn
                    });
                }
            }

            if (columns.Count == 0)
            {
                continue;
            }

            tables.TryAdd(key, new SqlSchemaParser.ParsedTable
            {
                Key = key,
                Schema = schema,
                Name = tableName,
                EntityTypeName = classSymbol.Name,
                Dialect = DatabaseDialect.Unknown,
                FilePath = filePath,
                LineNumber = line,
                Columns = columns,
                ForeignKeys = foreignKeys
            });
        }
    }

    private static void ExtractFluentMappings(
        ClassDeclarationSyntax dbContextClass,
        string filePath,
        Dictionary<string, SqlSchemaParser.ParsedTable> tables)
    {
        var text = dbContextClass.ToString();
        foreach (Match match in FluentToTableRegex.Matches(text))
        {
            var tableName = match.Groups[1].Value;
            var key = SqlSchemaParser.BuildTableKey(null, tableName);
            if (!tables.ContainsKey(key))
            {
                tables[key] = new SqlSchemaParser.ParsedTable
                {
                    Key = key,
                    Name = tableName,
                    FilePath = filePath,
                    LineNumber = dbContextClass.GetLocation().GetLineSpan().StartLinePosition.Line + 1,
                    Columns = []
                };
            }
        }

        foreach (Match match in FluentFkRegex.Matches(text))
        {
            _ = match;
        }
    }

    private static bool InheritsDbContext(INamedTypeSymbol symbol)
    {
        for (var current = symbol; current is not null; current = current.BaseType)
        {
            if (string.Equals(current.Name, "DbContext", StringComparison.Ordinal))
            {
                return true;
            }
        }

        return false;
    }

    private static bool IsDbSetPropertyType(INamedTypeSymbol named) =>
        named.IsGenericType && string.Equals(named.OriginalDefinition.Name, "DbSet", StringComparison.Ordinal);

    private static bool LooksLikeEntity(INamedTypeSymbol symbol, Dictionary<string, string> dbSetEntities) =>
        dbSetEntities.ContainsKey(symbol.Name)
        || HasAttribute(symbol, "Table")
        || symbol.GetMembers().OfType<IPropertySymbol>().Any(p => HasAttribute(p, "Key") || HasAttribute(p, "ForeignKey"));

    private static string ResolveTableName(INamedTypeSymbol symbol)
    {
        var table = GetAttributeArgument(symbol, "Table");
        return string.IsNullOrWhiteSpace(table) ? symbol.Name : table!;
    }

    private static string? ResolveSchema(INamedTypeSymbol symbol) =>
        GetAttributeArgument(symbol, "Table", argumentIndex: 1);

    private static string ResolveColumnName(IPropertySymbol property)
    {
        var column = GetAttributeArgument(property, "Column");
        return string.IsNullOrWhiteSpace(column) ? property.Name : column!;
    }

    private static (string RefTable, string RefColumn)? GetForeignKeyInfo(IPropertySymbol property)
    {
        var attr = property.GetAttributes()
            .FirstOrDefault(a =>
            {
                var attrName = a.AttributeClass?.Name;
                return attrName == "ForeignKey" || attrName == "ForeignKeyAttribute";
            });
        if (attr is null)
        {
            return null;
        }

        var nav = attr.ConstructorArguments.FirstOrDefault().Value?.ToString();
        if (!string.IsNullOrWhiteSpace(nav))
        {
            return (nav, "Id");
        }

        return null;
    }

    private static bool HasAttribute(ISymbol symbol, string name) =>
        symbol.GetAttributes().Any(a =>
        {
            var attrName = a.AttributeClass?.Name;
            return attrName == name || attrName == name + "Attribute";
        });

    private static string? GetAttributeArgument(ISymbol symbol, string attributeName, int argumentIndex = 0)
    {
        var attr = symbol.GetAttributes()
            .FirstOrDefault(a =>
            {
                var attrName = a.AttributeClass?.Name;
                return attrName == attributeName || attrName == attributeName + "Attribute";
            });
        if (attr is null || attr.ConstructorArguments.Length <= argumentIndex)
        {
            return null;
        }

        return attr.ConstructorArguments[argumentIndex].Value?.ToString();
    }
}
