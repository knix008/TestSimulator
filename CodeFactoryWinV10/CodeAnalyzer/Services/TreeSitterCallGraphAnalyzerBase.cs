using CodeAnalyzer.Models;
using TreeSitter;

namespace CodeAnalyzer.Services;

public abstract class TreeSitterCallGraphAnalyzerBase : ICallGraphAnalyzer
{
    public abstract string LanguageId { get; }
    protected abstract string DisplayPrefix { get; }

    // Returns the Tree-sitter language id for the given file (e.g. "cpp" or "c").
    // Default: use LanguageName for all files.
    protected virtual string GetTreeSitterLanguageName(string filePath) => LanguageName;
    protected abstract string LanguageName { get; }

    // S-expression query patterns. Capture names:
    //   @name   — function/method name identifier node
    //   @def    — the whole function definition node (used for byte-range containment)
    //   @callee — callee name identifier node inside a call expression
    protected abstract string FuncDefQueryPattern { get; }
    protected abstract string CallQueryPattern { get; }

    // Override to supply grammar-specific patterns when one analyzer handles multiple grammars
    // with different node types (e.g. "c" vs "cpp"). Default: use the shared patterns above.
    protected virtual string GetFuncDefQueryPattern(string grammarName) => FuncDefQueryPattern;
    protected virtual string GetCallQueryPattern(string grammarName) => CallQueryPattern;

    public async Task<CallGraphResult> AnalyzeAsync(
        IReadOnlyList<string> sourceFiles,
        AnalysisProgressTracker? progress = null,
        CancellationToken cancellationToken = default)
    {
        if (sourceFiles.Count == 0)
        {
            return new CallGraphResult();
        }

        var parsedFiles = new List<ParsedFile>(sourceFiles.Count);

        // Group files by grammar id to create Language/Parser/Query once per grammar,
        // rather than once per file (which would be very expensive for large projects).
        var byGrammar = sourceFiles.GroupBy(GetTreeSitterLanguageName, StringComparer.Ordinal);

        foreach (var group in byGrammar)
        {
            cancellationToken.ThrowIfCancellationRequested();

            using var language = new Language(group.Key);
            using var parser = new Parser(language);
            using var funcQuery = new Query(language, GetFuncDefQueryPattern(group.Key));
            using var callQuery = new Query(language, GetCallQueryPattern(group.Key));

            foreach (var file in group)
            {
                cancellationToken.ThrowIfCancellationRequested();

                if (!SourceFileScanGuards.IsWithinTreeSitterBudget(file))
                {
                    parsedFiles.Add(new ParsedFile(file, [], []));
                    progress?.Report($"{DisplayPrefix.Trim('[', ']')} 건너뜀(대용량): {Path.GetFileName(file)}");
                    continue;
                }

                try
                {
                    var source = await File.ReadAllTextAsync(file, cancellationToken).ConfigureAwait(false);
                    var parsed = ParseFile(file, source, parser, funcQuery, callQuery, cancellationToken);
                    parsedFiles.Add(parsed);
                    progress?.Report($"{DisplayPrefix.Trim('[', ']')}: {Path.GetFileName(file)}");
                }
                catch (Exception ex) when (!AnalysisCancellation.IsCancellation(ex))
                {
                    parsedFiles.Add(new ParsedFile(file, [], []));
                    progress?.Report($"{DisplayPrefix.Trim('[', ']')} 건너뜀: {Path.GetFileName(file)}");
                }
            }
        }

        var globalIndex = BuildGlobalIndex(parsedFiles);

        var nodes = new Dictionary<string, CallGraphNode>(StringComparer.Ordinal);
        var edges = new HashSet<(string CallerId, string CalleeId)>();

        foreach (var parsedFile in parsedFiles)
        {
            cancellationToken.ThrowIfCancellationRequested();

            foreach (var def in parsedFile.Functions)
            {
                nodes.TryAdd(def.Id, new CallGraphNode
                {
                    Id = def.Id,
                    DisplayName = def.Name,
                    FullName = $"{DisplayPrefix} {Path.GetFileName(parsedFile.FilePath)}::{def.Name}",
                    FilePath = parsedFile.FilePath,
                    LineNumber = def.Line
                });
            }

            foreach (var call in parsedFile.Calls)
            {
                cancellationToken.ThrowIfCancellationRequested();

                var caller = FindEnclosing(parsedFile.Functions, call.ByteOffset);
                if (caller is null) continue;

                if (!globalIndex.TryGetValue(call.CalleeName, out var callees)) continue;

                foreach (var callee in callees)
                {
                    nodes.TryAdd(callee.Id, new CallGraphNode
                    {
                        Id = callee.Id,
                        DisplayName = callee.Name,
                        FullName = $"{DisplayPrefix} {Path.GetFileName(callee.FilePath)}::{callee.Name}",
                        FilePath = callee.FilePath,
                        LineNumber = callee.Line
                    });
                    edges.Add((caller.Id, callee.Id));
                }
            }
        }

        return CallGraphBuilder.Build(
            nodes.Values.ToList(),
            edges.Select(e => new CallGraphEdge { CallerId = e.CallerId, CalleeId = e.CalleeId }).ToList());
    }

    private ParsedFile ParseFile(
        string filePath,
        string source,
        Parser parser,
        Query funcQuery,
        Query callQuery,
        CancellationToken cancellationToken)
    {
        var functions = new List<FunctionDef>();
        var calls = new List<CallSite>();

        using var tree = parser.Parse(source) ?? throw new InvalidOperationException($"Tree-sitter parse returned null for '{filePath}'");

        foreach (var match in funcQuery.Execute(tree.RootNode).Matches)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var nameCapture = match.Captures.FirstOrDefault(c => c.Name == "name");
            var defCapture = match.Captures.FirstOrDefault(c => c.Name == "def");
            if (nameCapture is null) continue;

            var funcName = nameCapture.Node.Text;
            if (string.IsNullOrWhiteSpace(funcName)) continue;

            var rangeNode = defCapture?.Node ?? nameCapture.Node;
            var line = nameCapture.Node.StartPosition.Row + 1;
            var id = MakeId(filePath, funcName);

            // Avoid duplicate definitions at same location (can occur with alternation patterns)
            if (!functions.Any(f => f.Id == id && f.Line == line))
            {
                functions.Add(new FunctionDef(funcName, id, filePath, rangeNode.StartIndex, rangeNode.EndIndex, line));
            }
        }

        foreach (var capture in callQuery.Execute(tree.RootNode).Captures)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var name = capture.Node.Text;
            if (string.IsNullOrWhiteSpace(name)) continue;

            calls.Add(new CallSite(name, capture.Node.StartIndex));
        }

        return new ParsedFile(filePath, functions, calls);
    }

    private static Dictionary<string, List<FunctionDef>> BuildGlobalIndex(IEnumerable<ParsedFile> files)
    {
        var index = new Dictionary<string, List<FunctionDef>>(StringComparer.Ordinal);

        foreach (var def in files.SelectMany(f => f.Functions))
        {
            if (!index.TryGetValue(def.Name, out var list))
            {
                list = [];
                index[def.Name] = list;
            }

            list.Add(def);
        }

        return index;
    }

    private static FunctionDef? FindEnclosing(IReadOnlyList<FunctionDef> functions, int byteOffset)
    {
        FunctionDef? best = null;

        foreach (var func in functions)
        {
            if (byteOffset < func.StartIndex || byteOffset >= func.EndIndex) continue;

            // Pick the innermost (smallest range)
            if (best is null || (func.EndIndex - func.StartIndex) < (best.EndIndex - best.StartIndex))
            {
                best = func;
            }
        }

        return best;
    }

    private string MakeId(string filePath, string funcName)
        => $"{LanguageId}:{filePath}::{funcName}";

    private sealed record FunctionDef(string Name, string Id, string FilePath, int StartIndex, int EndIndex, int Line);
    private sealed record CallSite(string CalleeName, int ByteOffset);
    private sealed record ParsedFile(string FilePath, IReadOnlyList<FunctionDef> Functions, IReadOnlyList<CallSite> Calls);
}
