namespace CodeAnalyzer.Services;

/// <summary>
/// Python call graph analyzer using Tree-sitter.
/// Handles: top-level functions, class methods, async functions, nested functions.
/// </summary>
public sealed class PythonCallGraphAnalyzer : TreeSitterCallGraphAnalyzerBase
{
    public override string LanguageId => "python";
    protected override string DisplayPrefix => "[Python]";
    protected override string LanguageName => "python";

    // Both sync and async function definitions share the same node type.
    protected override string FuncDefQueryPattern => @"
(function_definition
  name: (identifier) @name) @def";

    // Direct calls: foo(args) and attribute calls: obj.method(args)
    protected override string CallQueryPattern => @"
[
  (call
    function: (identifier) @callee)

  (call
    function: (attribute
      attribute: (identifier) @callee))
]";
}
