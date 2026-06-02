namespace CodeAnalyzer.Services;

/// <summary>
/// Maps language IDs to the best available analyzer for that language.
/// Priority: Roslyn (C#/VB.NET) > Tree-sitter (all others).
/// </summary>
public static class LanguageAnalyzerRegistry
{
    private static readonly IReadOnlyDictionary<string, ICallGraphAnalyzer> Analyzers = BuildRegistry();

    private static IReadOnlyDictionary<string, ICallGraphAnalyzer> BuildRegistry()
    {
        var list = new List<ICallGraphAnalyzer>
        {
            // Roslyn — full semantic analysis for .NET languages
            new CSharpCallGraphAnalyzer(),
            new VisualBasicCallGraphAnalyzer(),

            // Tree-sitter — accurate AST parsing for all other supported languages
            new CppCallGraphAnalyzer(),
            new PythonCallGraphAnalyzer(),
            new JavaCallGraphAnalyzer(),
            new JavaScriptCallGraphAnalyzer(),
            new GoCallGraphAnalyzer(),
            new RustCallGraphAnalyzer(),
            new SwiftCallGraphAnalyzer(),
            new RubyCallGraphAnalyzer(),
            new PhpCallGraphAnalyzer(),
        };

        return list.ToDictionary(a => a.LanguageId, StringComparer.OrdinalIgnoreCase);
    }

    public static ICallGraphAnalyzer? GetAnalyzer(string languageId)
        => Analyzers.GetValueOrDefault(languageId);

    public static IReadOnlyCollection<ICallGraphAnalyzer> All => (IReadOnlyCollection<ICallGraphAnalyzer>)Analyzers.Values;
}
