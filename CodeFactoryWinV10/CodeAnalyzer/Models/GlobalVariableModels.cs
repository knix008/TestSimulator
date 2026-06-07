namespace CodeAnalyzer.Models;

public enum GlobalVariableAccessKind
{
    Read,
    Write,
    ReadWrite
}

public sealed class GlobalVariableAccess
{
    public required string GlobalVariableId { get; init; }
    public required string FunctionId { get; init; }
    public required string FunctionDisplayName { get; init; }
    public required string FunctionFullName { get; init; }
    public required string FunctionFilePath { get; init; }
    public int FunctionLineNumber { get; init; }
    public GlobalVariableAccessKind Kind { get; init; }
}

public enum GlobalVariableScope
{
    File,
    Module,
    ClassStatic
}

public sealed class GlobalVariableItem
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required string LanguageId { get; init; }
    public required string FilePath { get; init; }
    public int LineNumber { get; init; }
    public GlobalVariableScope Scope { get; init; }
    public string TypeName { get; init; } = string.Empty;
    public string ContainingScope { get; init; } = string.Empty;
    public string AccessModifier { get; init; } = string.Empty;
    public bool IsConst { get; init; }
    public bool IsReadOnly { get; init; }
    public string Declaration { get; init; } = string.Empty;
}

public sealed class GlobalVariableResult
{
    public IReadOnlyList<GlobalVariableItem> Variables { get; init; } = [];
    public IReadOnlyList<GlobalVariableAccess> Accesses { get; init; } = [];

    public IReadOnlyDictionary<string, IReadOnlyList<GlobalVariableAccess>> AccessesByVariableId { get; init; }
        = new Dictionary<string, IReadOnlyList<GlobalVariableAccess>>(StringComparer.OrdinalIgnoreCase);

    public IReadOnlyList<GlobalVariableAccess> GetAccessesFor(string variableId) =>
        AccessesByVariableId.TryGetValue(variableId, out var accesses) ? accesses : [];
}
