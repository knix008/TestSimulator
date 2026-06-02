namespace CodeAnalyzer.Services;

public sealed class PhpCallGraphAnalyzer : TreeSitterCallGraphAnalyzerBase
{
    public override string LanguageId => "php";
    protected override string DisplayPrefix => "[PHP]";
    protected override string LanguageName => "php";

    protected override string FuncDefQueryPattern => @"
[
  (function_definition
    name: (name) @name) @def

  (method_declaration
    name: (name) @name) @def
]";

    protected override string CallQueryPattern => @"
[
  (function_call_expression
    function: (name) @callee)

  (member_call_expression
    name: (name) @callee)

  (scoped_call_expression
    name: (name) @callee)
]";
}
