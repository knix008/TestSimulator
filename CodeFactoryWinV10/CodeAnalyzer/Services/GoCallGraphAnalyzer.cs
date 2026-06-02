namespace CodeAnalyzer.Services;

public sealed class GoCallGraphAnalyzer : TreeSitterCallGraphAnalyzerBase
{
    public override string LanguageId => "go";
    protected override string DisplayPrefix => "[Go]";
    protected override string LanguageName => "go";

    protected override string FuncDefQueryPattern => @"
[
  (function_declaration
    name: (identifier) @name) @def

  (method_declaration
    name: (field_identifier) @name) @def
]";

    protected override string CallQueryPattern => @"
[
  (call_expression
    function: (identifier) @callee)

  (call_expression
    function: (selector_expression
      field: (field_identifier) @callee))
]";
}
