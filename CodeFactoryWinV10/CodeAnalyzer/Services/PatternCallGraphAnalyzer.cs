using System.Text.RegularExpressions;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public sealed class PatternCallGraphAnalyzer
{
    private static readonly Regex StringRegex = new("\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'", RegexOptions.Compiled);
    private static readonly Regex CommentRegex = new("//.*$|/\\*.*?\\*/|#.*$", RegexOptions.Compiled | RegexOptions.Multiline);

    private readonly string _languageId;
    private readonly string _displayPrefix;
    public string LanguageId => _languageId;

    private readonly Regex _definitionRegex;
    private readonly HashSet<string> _reservedWords;

    private PatternCallGraphAnalyzer(
        string languageId,
        string displayPrefix,
        string definitionPattern,
        IEnumerable<string> reservedWords)
    {
        _languageId = languageId;
        _displayPrefix = displayPrefix;
        _definitionRegex = new Regex(definitionPattern, RegexOptions.Compiled | RegexOptions.Multiline);
        _reservedWords = new HashSet<string>(reservedWords, StringComparer.Ordinal);
    }

    public static IReadOnlyList<PatternCallGraphAnalyzer> CreateAll()
    {
        return
        [
            new PatternCallGraphAnalyzer(
                "python",
                "[Python]",
                @"^\s*def\s+([A-Za-z_]\w*)\s*\(",
                ["if", "for", "while", "return", "print", "def", "class", "import", "from", "pass", "None", "True", "False"]),
            new PatternCallGraphAnalyzer(
                "java",
                "[Java]",
                @"^\s*(?:public|private|protected|static|final|native|synchronized|abstract|\s)*[\w<>\[\]?,\s]+\s+([A-Za-z_]\w*)\s*\(",
                ["if", "for", "while", "return", "new", "class", "public", "private", "protected", "static", "void", "int", "this", "super"]),
            new PatternCallGraphAnalyzer(
                "cpp",
                "[C/C++]",
                @"^\s*(?:inline|static|virtual|explicit|constexpr|\s)*[\w:\*&<>\s]+?\s+([A-Za-z_]\w*)\s*\([^;]*\)\s*(?:const\s*)?\{",
                ["if", "for", "while", "return", "switch", "case", "sizeof", "new", "delete", "class", "struct", "namespace", "this"]),
            new PatternCallGraphAnalyzer(
                "javascript",
                "[JS/TS]",
                @"^\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s+([A-Za-z_$]\w*)\s*\(|^\s*(?:const|let|var)\s+([A-Za-z_$]\w*)\s*=\s*(?:async\s*)?(?:function\s*\*?\s*)?\(|^\s*(?:public|private|protected|static|async|\s)+([A-Za-z_$]\w*)\s*\(",
                ["if", "for", "while", "return", "function", "class", "const", "let", "var", "new", "await", "async", "import", "export", "this"]),
            new PatternCallGraphAnalyzer(
                "go",
                "[Go]",
                @"^\s*func\s+(?:\([^)]+\)\s+)?([A-Za-z_]\w*)\s*\(",
                ["if", "for", "range", "return", "func", "go", "defer", "make", "new", "len", "append", "panic", "print"]),
            new PatternCallGraphAnalyzer(
                "rust",
                "[Rust]",
                @"^\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)\s*\(",
                ["if", "for", "while", "return", "fn", "let", "mut", "match", "impl", "struct", "enum", "self", "Self"]),
            new PatternCallGraphAnalyzer(
                "kotlin",
                "[Kotlin]",
                @"^\s*(?:private|public|protected|internal|override|suspend|\s)*fun\s+([A-Za-z_]\w*)\s*\(",
                ["if", "for", "while", "return", "fun", "val", "var", "class", "object", "when", "this", "super"]),
            new PatternCallGraphAnalyzer(
                "swift",
                "[Swift]",
                @"^\s*(?:public|private|internal|open|\s)*func\s+([A-Za-z_]\w*)\s*\(",
                ["if", "for", "while", "return", "func", "let", "var", "class", "struct", "guard", "self", "Self"]),
            new PatternCallGraphAnalyzer(
                "ruby",
                "[Ruby]",
                @"^\s*def\s+(?:self\.)?([A-Za-z_]\w*[?!]?)\s*(?:\(|\s|$)",
                ["if", "for", "while", "return", "def", "class", "module", "end", "self", "puts", "require"]),
            new PatternCallGraphAnalyzer(
                "php",
                "[PHP]",
                @"^\s*(?:public|private|protected|static|\s)*function\s+([A-Za-z_]\w*)\s*\(",
                ["if", "for", "while", "return", "function", "class", "public", "private", "protected", "static", "new", "echo", "self", "parent"])
        ];
    }

    public async Task<CallGraphResult> AnalyzeAsync(
        IReadOnlyList<string> sourceFiles,
        AnalysisProgressTracker? progress = null,
        CancellationToken cancellationToken = default)
    {
        if (sourceFiles.Count == 0)
        {
            return new CallGraphResult();
        }

        var fileModels = new List<FileModel>();

        foreach (var file in sourceFiles)
        {
            cancellationToken.ThrowIfCancellationRequested();

            try
            {
                var content = await File.ReadAllTextAsync(file, cancellationToken).ConfigureAwait(false);
                fileModels.Add(ParseFile(file, content));
                progress?.Report($"{_displayPrefix.Trim('[', ']')}: {Path.GetFileName(file)}");
            }
            catch (Exception ex) when (!AnalysisCancellation.IsCancellation(ex))
            {
                progress?.Report($"{_displayPrefix.Trim('[', ']')} 건너뜀: {Path.GetFileName(file)}");
            }
        }

        var globalNameIndex = BuildGlobalNameIndex(fileModels);
        var nodes = new Dictionary<string, CallGraphNode>(StringComparer.Ordinal);
        var edges = new HashSet<(string CallerId, string CalleeId)>();

        foreach (var fileModel in fileModels)
        {
            cancellationToken.ThrowIfCancellationRequested();

            foreach (var function in fileModel.Functions)
            {
                nodes.TryAdd(function.Id, function.Node);

                foreach (var callName in function.CallNames)
                {
                    if (_reservedWords.Contains(callName))
                    {
                        continue;
                    }

                    if (!globalNameIndex.TryGetValue(callName, out var callees))
                    {
                        continue;
                    }

                    foreach (var callee in callees)
                    {
                        nodes.TryAdd(callee.Id, callee.Node);
                        edges.Add((function.Id, callee.Id));
                    }
                }
            }
        }

        return CallGraphBuilder.Build(
            nodes.Values.ToList(),
            edges.Select(edge => new CallGraphEdge { CallerId = edge.CallerId, CalleeId = edge.CalleeId }).ToList());
    }

    private FileModel ParseFile(string filePath, string content)
    {
        var sanitized = StripCommentsAndStrings(content);
        var lines = sanitized.Split('\n');
        var functions = new List<FunctionModel>();

        for (var lineIndex = 0; lineIndex < lines.Length; lineIndex++)
        {
            var line = lines[lineIndex];
            var match = _definitionRegex.Match(line);
            if (!match.Success)
            {
                continue;
            }

            var functionName = match.Groups.Cast<Group>()
                .Skip(1)
                .FirstOrDefault(group => group.Success)?.Value;

            if (string.IsNullOrWhiteSpace(functionName) || _reservedWords.Contains(functionName))
            {
                continue;
            }

            var endLine = FindFunctionEndLine(lines, lineIndex, _languageId);
            var body = string.Join('\n', lines.Skip(lineIndex).Take(endLine - lineIndex + 1));
            var callNames = ExtractCallNames(body, functionName);

            var id = CreateFunctionId(filePath, functionName);
            functions.Add(new FunctionModel(
                id,
                new CallGraphNode
                {
                    Id = id,
                    DisplayName = functionName,
                    FullName = $"{_displayPrefix} {Path.GetFileName(filePath)}::{functionName}",
                    FilePath = filePath,
                    LineNumber = lineIndex + 1
                },
                callNames));
        }

        return new FileModel(filePath, functions);
    }

    private static int FindFunctionEndLine(string[] lines, int startLine, string languageId)
    {
        if (languageId == "python")
        {
            var baseIndent = CountIndent(lines[startLine]);
            for (var index = startLine + 1; index < lines.Length; index++)
            {
                if (string.IsNullOrWhiteSpace(lines[index]))
                {
                    continue;
                }

                if (CountIndent(lines[index]) <= baseIndent)
                {
                    return index - 1;
                }
            }

            return lines.Length - 1;
        }

        var braceDepth = 0;
        var started = false;
        for (var index = startLine; index < lines.Length; index++)
        {
            foreach (var ch in lines[index])
            {
                if (ch == '{')
                {
                    braceDepth++;
                    started = true;
                }
                else if (ch == '}')
                {
                    braceDepth--;
                    if (started && braceDepth <= 0)
                    {
                        return index;
                    }
                }
            }
        }

        return Math.Min(startLine + 80, lines.Length - 1);
    }

    private static int CountIndent(string line)
    {
        var count = 0;
        foreach (var ch in line)
        {
            if (ch == ' ')
            {
                count++;
            }
            else if (ch == '\t')
            {
                count += 4;
            }
            else
            {
                break;
            }
        }

        return count;
    }

    private HashSet<string> ExtractCallNames(string body, string selfName)
    {
        var calls = new HashSet<string>(StringComparer.Ordinal);
        foreach (Match match in Regex.Matches(body, @"\b([A-Za-z_]\w*)\s*\(", RegexOptions.CultureInvariant))
        {
            var name = match.Groups[1].Value;
            if (name == selfName || _reservedWords.Contains(name))
            {
                continue;
            }

            calls.Add(name);
        }

        return calls;
    }

    private static string StripCommentsAndStrings(string content)
    {
        content = StringRegex.Replace(content, match => new string(' ', match.Length));
        content = CommentRegex.Replace(content, match => new string(' ', match.Length));
        return content;
    }

    private string CreateFunctionId(string filePath, string functionName)
    {
        return $"{_languageId}:{filePath}::{functionName}";
    }

    private static Dictionary<string, List<FunctionModel>> BuildGlobalNameIndex(IEnumerable<FileModel> files)
    {
        var index = new Dictionary<string, List<FunctionModel>>(StringComparer.Ordinal);

        foreach (var function in files.SelectMany(file => file.Functions))
        {
            if (!index.TryGetValue(function.Node.DisplayName, out var list))
            {
                list = [];
                index[function.Node.DisplayName] = list;
            }

            list.Add(function);
        }

        return index;
    }

    private sealed record FileModel(string FilePath, List<FunctionModel> Functions);

    private sealed record FunctionModel(string Id, CallGraphNode Node, HashSet<string> CallNames);
}
