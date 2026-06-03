namespace CodeAnalyzer.Services.Metrics;

internal static class TreeSitterMetricsConfigs
{
    public static IReadOnlyList<TreeSitterMetricsConfig> All { get; } =
    [
        new TreeSitterMetricsConfig
        {
            LanguageId = "python",
            DisplayPrefix = "[Python]",
            DefaultGrammarName = "python",
            FuncDefQueryPattern = """
(function_definition
  name: (identifier) @name) @def
"""
        },
        new TreeSitterMetricsConfig
        {
            LanguageId = "java",
            DisplayPrefix = "[Java]",
            DefaultGrammarName = "java",
            FuncDefQueryPattern = """
[
  (method_declaration
    name: (identifier) @name) @def
  (constructor_declaration
    name: (identifier) @name) @def
]
"""
        },
        new TreeSitterMetricsConfig
        {
            LanguageId = "cpp",
            DisplayPrefix = "[C/C++]",
            DefaultGrammarName = "cpp",
            ResolveGrammarName = static path =>
            {
                var ext = Path.GetExtension(path);
                return ext.Equals(".c", StringComparison.OrdinalIgnoreCase)
                    || ext.Equals(".h", StringComparison.OrdinalIgnoreCase)
                    ? "c"
                    : "cpp";
            },
            FuncDefQueryPattern = """
[
  (function_definition
    declarator: (function_declarator
      declarator: [(identifier) (field_identifier) (destructor_name) (operator_name)] @name)) @def
  (function_definition
    declarator: (function_declarator
      declarator: (qualified_identifier
        name: [(identifier) (destructor_name) (operator_name)] @name))) @def
  (function_definition
    declarator: (pointer_declarator
      declarator: (function_declarator
        declarator: [(identifier) (field_identifier)] @name))) @def
]
""",
            ResolveFuncDefQuery = static grammar => grammar == "c"
                ? """
[
  (function_definition
    declarator: (function_declarator
      declarator: (identifier) @name)) @def
  (function_definition
    declarator: (pointer_declarator
      declarator: (function_declarator
        declarator: (identifier) @name))) @def
]
"""
                : string.Empty
        },
        new TreeSitterMetricsConfig
        {
            LanguageId = "javascript",
            DisplayPrefix = "[JS/TS]",
            DefaultGrammarName = "javascript",
            ResolveGrammarName = static path =>
            {
                var ext = Path.GetExtension(path);
                if (ext.Equals(".tsx", StringComparison.OrdinalIgnoreCase)) return "tsx";
                if (ext.Equals(".ts", StringComparison.OrdinalIgnoreCase)) return "typescript";
                return "javascript";
            },
            FuncDefQueryPattern = """
[
  (function_declaration
    name: (identifier) @name) @def
  (method_definition
    name: (property_identifier) @name) @def
  (variable_declarator
    name: (identifier) @name
    value: [(function_expression) (arrow_function)]) @def
]
"""
        },
        new TreeSitterMetricsConfig
        {
            LanguageId = "go",
            DisplayPrefix = "[Go]",
            DefaultGrammarName = "go",
            FuncDefQueryPattern = """
[
  (function_declaration
    name: (identifier) @name) @def
  (method_declaration
    name: (field_identifier) @name) @def
]
"""
        },
        new TreeSitterMetricsConfig
        {
            LanguageId = "rust",
            DisplayPrefix = "[Rust]",
            DefaultGrammarName = "rust",
            FuncDefQueryPattern = """
(function_item
  name: (identifier) @name) @def
"""
        },
        new TreeSitterMetricsConfig
        {
            LanguageId = "swift",
            DisplayPrefix = "[Swift]",
            DefaultGrammarName = "swift",
            FuncDefQueryPattern = """
(function_declaration
  (simple_identifier) @name) @def
"""
        },
        new TreeSitterMetricsConfig
        {
            LanguageId = "ruby",
            DisplayPrefix = "[Ruby]",
            DefaultGrammarName = "ruby",
            FuncDefQueryPattern = """
[
  (method
    name: (identifier) @name) @def
  (singleton_method
    name: (identifier) @name) @def
]
"""
        },
        new TreeSitterMetricsConfig
        {
            LanguageId = "php",
            DisplayPrefix = "[PHP]",
            DefaultGrammarName = "php",
            FuncDefQueryPattern = """
[
  (function_definition
    name: (name) @name) @def
  (method_declaration
    name: (name) @name) @def
]
"""
        }
    ];
}
