namespace CodeAnalyzer.Services;

public sealed class RubyCallGraphAnalyzer : TreeSitterCallGraphAnalyzerBase
{
    public override string LanguageId => "ruby";
    protected override string DisplayPrefix => "[Ruby]";
    protected override string LanguageName => "ruby";

    protected override string FuncDefQueryPattern => @"
[
  (method
    name: (identifier) @name) @def

  (singleton_method
    name: (identifier) @name) @def
]";

    // tree-sitter-ruby uses only the `call` node for all method/function calls,
    // both with and without an explicit receiver.
    protected override string CallQueryPattern => @"
(call
  method: (identifier) @callee)";
}
