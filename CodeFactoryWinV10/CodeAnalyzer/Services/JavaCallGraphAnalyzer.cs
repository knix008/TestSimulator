namespace CodeAnalyzer.Services;

public sealed class JavaCallGraphAnalyzer : TreeSitterCallGraphAnalyzerBase
{
    public override string LanguageId => "java";
    protected override string DisplayPrefix => "[Java]";
    protected override string LanguageName => "java";

    protected override string FuncDefQueryPattern => @"
[
  (method_declaration
    name: (identifier) @name) @def

  (constructor_declaration
    name: (identifier) @name) @def
]";

    protected override string CallQueryPattern => @"
[
  (method_invocation
    name: (identifier) @callee)

  (object_creation_expression
    type: (type_identifier) @callee)
]";
}
