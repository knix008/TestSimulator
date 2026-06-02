namespace CodeAnalyzer.Services;

/// <summary>
/// C / C++ call graph analyzer using Tree-sitter for accurate AST parsing.
/// Uses the C grammar for .c/.h files and the C++ grammar for .cpp/.hpp/.cc/.cxx files.
/// Handles: free functions, class methods (qualified names), constructors, destructors.
/// </summary>
public sealed class CppCallGraphAnalyzer : TreeSitterCallGraphAnalyzerBase
{
    public override string LanguageId => "cpp";
    protected override string DisplayPrefix => "[C/C++]";
    protected override string LanguageName => "cpp";

    // Use C grammar for pure C files, C++ grammar for everything else.
    protected override string GetTreeSitterLanguageName(string filePath)
    {
        var ext = Path.GetExtension(filePath);
        return ext.Equals(".c", StringComparison.OrdinalIgnoreCase)
            || ext.Equals(".h", StringComparison.OrdinalIgnoreCase)
            ? "c"
            : "cpp";
    }

    // @name captures the function name; @def captures the whole function_definition.
    // Inside a class body, tree-sitter-cpp uses field_identifier (not identifier) for the method name.
    protected override string FuncDefQueryPattern => @"
[
  (function_definition
    declarator: (function_declarator
      declarator: [(identifier) (field_identifier) (destructor_name)] @name)) @def

  (function_definition
    declarator: (function_declarator
      declarator: (qualified_identifier
        name: [(identifier) (destructor_name)] @name))) @def

  (function_definition
    declarator: (pointer_declarator
      declarator: (function_declarator
        declarator: [(identifier) (field_identifier)] @name))) @def
]";

    // Capture @callee for:
    //   1. Direct calls:            foo(args)
    //   2. Member/pointer calls:    obj.foo(args)  obj->foo(args)
    //   3. Qualified calls:         Ns::foo(args)  (C++ only)
    protected override string CallQueryPattern => @"
[
  (call_expression
    function: (identifier) @callee)

  (call_expression
    function: (field_expression
      field: (field_identifier) @callee))

  (call_expression
    function: (qualified_identifier
      name: (identifier) @callee))
]";

    // C grammar lacks C++-specific node types (destructor_name, qualified_identifier for methods).
    // Using the full C++ pattern against the C grammar causes a query compile error.
    private const string CFuncDefQueryPattern = @"
[
  (function_definition
    declarator: (function_declarator
      declarator: (identifier) @name)) @def

  (function_definition
    declarator: (pointer_declarator
      declarator: (function_declarator
        declarator: (identifier) @name))) @def
]";

    private const string CCallQueryPattern = @"
[
  (call_expression
    function: (identifier) @callee)

  (call_expression
    function: (field_expression
      field: (field_identifier) @callee))
]";

    protected override string GetFuncDefQueryPattern(string grammarName)
        => grammarName == "c" ? CFuncDefQueryPattern : FuncDefQueryPattern;

    protected override string GetCallQueryPattern(string grammarName)
        => grammarName == "c" ? CCallQueryPattern : CallQueryPattern;
}
