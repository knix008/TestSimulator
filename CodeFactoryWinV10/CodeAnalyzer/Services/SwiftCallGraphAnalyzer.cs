namespace CodeAnalyzer.Services;

public sealed class SwiftCallGraphAnalyzer : TreeSitterCallGraphAnalyzerBase
{
    public override string LanguageId => "swift";
    protected override string DisplayPrefix => "[Swift]";
    protected override string LanguageName => "swift";

    protected override string FuncDefQueryPattern => @"
(function_declaration
  name: (simple_identifier) @name) @def";

    protected override string CallQueryPattern => @"
[
  (call_expression
    function: (simple_identifier) @callee)

  (navigation_expression
    navigation_suffix: (navigation_suffix
      (simple_identifier) @callee))
]";
}
