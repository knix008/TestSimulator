namespace CodeAnalyzer.Services;

public sealed class RustCallGraphAnalyzer : TreeSitterCallGraphAnalyzerBase
{
    public override string LanguageId => "rust";
    protected override string DisplayPrefix => "[Rust]";
    protected override string LanguageName => "rust";

    protected override string FuncDefQueryPattern => @"
(function_item
  name: (identifier) @name) @def";

    protected override string CallQueryPattern => @"
[
  (call_expression
    function: (identifier) @callee)

  (call_expression
    function: (field_expression
      field: (field_identifier) @callee))

  (call_expression
    function: (scoped_identifier
      name: (identifier) @callee))
]";
}
