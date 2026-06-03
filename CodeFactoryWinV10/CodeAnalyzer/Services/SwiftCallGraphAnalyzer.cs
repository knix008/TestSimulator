namespace CodeAnalyzer.Services;

public sealed class SwiftCallGraphAnalyzer : TreeSitterCallGraphAnalyzerBase
{
    public override string LanguageId => "swift";
    protected override string DisplayPrefix => "[Swift]";
    protected override string LanguageName => "swift";

    // tree-sitter-swift does not define named fields on function_declaration or call_expression;
    // match positionally instead.
    protected override string FuncDefQueryPattern => @"
(function_declaration
  (simple_identifier) @name) @def";

    protected override string CallQueryPattern => @"
[
  (call_expression
    (simple_identifier) @callee)

  (navigation_expression
    (navigation_suffix
      (simple_identifier) @callee))
]";
}
