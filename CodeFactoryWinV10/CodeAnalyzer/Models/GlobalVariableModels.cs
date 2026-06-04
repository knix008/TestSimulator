namespace CodeAnalyzer.Models;

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
}
