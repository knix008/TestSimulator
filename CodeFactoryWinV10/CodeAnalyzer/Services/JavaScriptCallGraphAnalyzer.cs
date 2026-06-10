namespace CodeAnalyzer.Services;

/// <summary>
/// JavaScript/TypeScript call graph analyzer using Tree-sitter.
/// Uses the TypeScript grammar for .ts/.tsx files and JavaScript grammar for .js/.jsx/.mjs/.cjs.
/// Handles: function declarations, arrow functions, class methods, async variants.
/// </summary>
public sealed class JavaScriptCallGraphAnalyzer : TreeSitterCallGraphAnalyzerBase
{
    public override string LanguageId => "javascript";
    protected override string DisplayPrefix => "[JS/TS]";
    protected override string LanguageName => "javascript";

    protected override string GetTreeSitterLanguageName(string filePath)
    {
        var ext = Path.GetExtension(filePath);
        if (ext.Equals(".tsx", StringComparison.OrdinalIgnoreCase)) return "tsx";
        if (ext.Equals(".ts", StringComparison.OrdinalIgnoreCase)) return "typescript";
        return "javascript";
    }

    protected override string FuncDefQueryPattern => @"
[
  (function_declaration
    name: (identifier) @name) @def

  (method_definition
    name: (property_identifier) @name) @def

  (variable_declarator
    name: (identifier) @name
    value: [(function_expression) (arrow_function)]) @def
]";

    protected override string CallQueryPattern => @"
[
  (call_expression
    function: (identifier) @callee)

  (call_expression
    function: (member_expression
      property: (property_identifier) @callee))
]";
}
