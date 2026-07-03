using System.Text.RegularExpressions;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.GlobalVariables;

public static class GlobalVariableAccessAnalyzer
{
    private static readonly Regex CommentRegex = new(
        "//.*$|/\\*.*?\\*/|#.*$",
        RegexOptions.Compiled | RegexOptions.Multiline);

    public static GlobalVariableResult EnrichWithAccesses(
        GlobalVariableResult globals,
        IReadOnlyList<FunctionMetric> functions,
        CallGraphResult callGraph)
    {
        if (globals.Variables.Count == 0)
        {
            return globals;
        }

        var accesses = new List<GlobalVariableAccess>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var variablesByLanguage = globals.Variables
            .GroupBy(variable => variable.LanguageId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.ToList(), StringComparer.OrdinalIgnoreCase);

        var fileCache = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);

        foreach (var function in functions)
        {
            if (!variablesByLanguage.TryGetValue(function.LanguageId, out var candidates)
                || candidates.Count == 0)
            {
                continue;
            }

            if (!TryReadLines(function.FilePath, fileCache, out var lines))
            {
                continue;
            }

            var start = Math.Max(1, function.StartLine);
            var end = Math.Min(lines.Length, Math.Max(function.EndLine, function.StartLine));
            if (start > end)
            {
                continue;
            }

            var body = string.Join('\n', lines.AsSpan(start - 1, end - start + 1).ToArray());
            if (string.IsNullOrWhiteSpace(body))
            {
                continue;
            }

            foreach (var variable in candidates)
            {
                if (!ReferencesVariable(body, variable, function))
                {
                    continue;
                }

                var functionId = ResolveFunctionId(function, callGraph);
                var key = variable.Id + "\0" + functionId;
                if (!seen.Add(key))
                {
                    continue;
                }

                accesses.Add(new GlobalVariableAccess
                {
                    GlobalVariableId = variable.Id,
                    FunctionId = functionId,
                    FunctionDisplayName = function.DisplayName,
                    FunctionFullName = function.FullName,
                    FunctionFilePath = function.FilePath,
                    FunctionLineNumber = function.StartLine,
                    Kind = DetectAccessKind(body, variable)
                });
            }
        }

        AppendCallGraphOnlyAccessors(globals, callGraph, accesses, seen, fileCache);

        var grouped = accesses
            .GroupBy(access => access.GlobalVariableId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<GlobalVariableAccess>)group
                    .OrderBy(access => access.FunctionFilePath, StringComparer.OrdinalIgnoreCase)
                    .ThenBy(access => access.FunctionLineNumber)
                    .ThenBy(access => access.FunctionDisplayName, StringComparer.OrdinalIgnoreCase)
                    .ToList(),
                StringComparer.OrdinalIgnoreCase);

        return new GlobalVariableResult
        {
            Variables = globals.Variables,
            Accesses = accesses,
            AccessesByVariableId = grouped
        };
    }

    private static void AppendCallGraphOnlyAccessors(
        GlobalVariableResult globals,
        CallGraphResult callGraph,
        List<GlobalVariableAccess> accesses,
        HashSet<string> seen,
        Dictionary<string, string[]> fileCache)
    {
        if (callGraph.Nodes.Count == 0)
        {
            return;
        }

        var variablesByLanguage = globals.Variables
            .GroupBy(variable => variable.LanguageId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.ToList(), StringComparer.OrdinalIgnoreCase);

        foreach (var node in callGraph.Nodes)
        {
            var languageId = ResolveLanguageId(node.Id);
            if (languageId is null
                || !variablesByLanguage.TryGetValue(languageId, out var candidates))
            {
                continue;
            }

            if (!TryReadLines(node.FilePath, fileCache, out var lines))
            {
                continue;
            }

            var start = Math.Max(1, node.LineNumber);
            var end = Math.Min(lines.Length, start + 400);
            if (start > end)
            {
                continue;
            }

            var body = string.Join('\n', lines.AsSpan(start - 1, end - start + 1).ToArray());
            if (string.IsNullOrWhiteSpace(body))
            {
                continue;
            }

            foreach (var variable in candidates)
            {
                if (!ReferencesVariable(body, variable, node.FilePath, node.LineNumber))
                {
                    continue;
                }

                var key = variable.Id + "\0" + node.Id;
                if (!seen.Add(key))
                {
                    continue;
                }

                accesses.Add(new GlobalVariableAccess
                {
                    GlobalVariableId = variable.Id,
                    FunctionId = node.Id,
                    FunctionDisplayName = node.DisplayName,
                    FunctionFullName = node.FullName,
                    FunctionFilePath = node.FilePath,
                    FunctionLineNumber = node.LineNumber,
                    Kind = DetectAccessKind(body, variable)
                });
            }
        }
    }

    private static bool ReferencesVariable(string body, GlobalVariableItem variable, FunctionMetric function) =>
        ReferencesVariable(body, variable, function.FilePath, function.StartLine);

    private static bool ReferencesVariable(
        string body,
        GlobalVariableItem variable,
        string functionFilePath,
        int functionStartLine)
    {
        if (IsDeclarationContext(body, variable, functionFilePath, functionStartLine))
        {
            return false;
        }

        if (ContainsReference(body, variable.Name))
        {
            return true;
        }

        if (!string.IsNullOrWhiteSpace(variable.ContainingScope))
        {
            var shortScope = variable.ContainingScope.Split('.').Last();
            if (ContainsQualifiedReference(body, shortScope, variable.Name))
            {
                return true;
            }

            if (ContainsQualifiedReference(body, variable.ContainingScope, variable.Name))
            {
                return true;
            }
        }

        return false;
    }

    private static bool IsDeclarationContext(
        string body,
        GlobalVariableItem variable,
        string functionFilePath,
        int functionStartLine)
    {
        if (!string.Equals(functionFilePath, variable.FilePath, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return functionStartLine <= variable.LineNumber
            && functionStartLine + CountLines(body) >= variable.LineNumber;
    }

    private static int CountLines(string text) =>
        string.IsNullOrEmpty(text) ? 0 : text.Count(ch => ch == '\n') + 1;

    private static bool ContainsReference(string body, string name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return false;
        }

        var pattern = $@"(?<![\w$@#]){Regex.Escape(name)}(?![\w$])";
        return Regex.IsMatch(body, pattern);
    }

    private static bool ContainsQualifiedReference(string body, string scope, string name)
    {
        if (string.IsNullOrWhiteSpace(scope) || string.IsNullOrWhiteSpace(name))
        {
            return false;
        }

        var pattern = $@"(?<![\w$@#]){Regex.Escape(scope)}\s*\.\s*{Regex.Escape(name)}(?![\w$])";
        return Regex.IsMatch(body, pattern);
    }

    private static GlobalVariableAccessKind DetectAccessKind(string body, GlobalVariableItem variable)
    {
        var hasWrite = HasWriteReference(body, variable);
        var hasRead = HasReadReference(body, variable);
        return hasWrite switch
        {
            true when hasRead => GlobalVariableAccessKind.ReadWrite,
            true => GlobalVariableAccessKind.Write,
            _ => GlobalVariableAccessKind.Read
        };
    }

    private static bool HasWriteReference(string body, GlobalVariableItem variable)
    {
        foreach (var token in BuildReferenceTokens(variable))
        {
            var pattern = $@"(?<![\w$@#]){Regex.Escape(token)}\s*(?<op>\+=|-=|\*=|/=|%=|&=|\|=|\^=|<<=|>>=|=)(?![=])";
            if (Regex.IsMatch(body, pattern))
            {
                return true;
            }

            if (Regex.IsMatch(body, $@"(?<![\w$@#]){Regex.Escape(token)}\s*(\+\+|--)(?![\w$])"))
            {
                return true;
            }
        }

        return false;
    }

    private static bool HasReadReference(string body, GlobalVariableItem variable) =>
        BuildReferenceTokens(variable).Any(token => ContainsReference(body, token)
            || token.Contains('.') && body.Contains(token, StringComparison.Ordinal));

    private static IEnumerable<string> BuildReferenceTokens(GlobalVariableItem variable)
    {
        yield return variable.Name;

        if (!string.IsNullOrWhiteSpace(variable.ContainingScope))
        {
            var shortScope = variable.ContainingScope.Split('.').Last();
            yield return $"{shortScope}.{variable.Name}";
            yield return $"{variable.ContainingScope}.{variable.Name}";
        }
    }

    private static string ResolveFunctionId(FunctionMetric function, CallGraphResult callGraph)
    {
        var match = callGraph.Nodes.FirstOrDefault(node =>
            string.Equals(node.FilePath, function.FilePath, StringComparison.OrdinalIgnoreCase)
            && string.Equals(node.DisplayName, function.DisplayName, StringComparison.Ordinal)
            && Math.Abs(node.LineNumber - function.StartLine) <= 3);

        return match?.Id ?? function.Id;
    }

    private static string? ResolveLanguageId(string nodeId)
    {
        var colon = nodeId.IndexOf(':');
        return colon > 0 ? nodeId[..colon] : null;
    }

    private static bool TryReadLines(
        string filePath,
        Dictionary<string, string[]> cache,
        out string[] lines)
    {
        lines = [];
        if (string.IsNullOrWhiteSpace(filePath))
        {
            return false;
        }

        if (cache.TryGetValue(filePath, out var cached))
        {
            lines = cached;
            return lines.Length > 0;
        }

        try
        {
            var content = CommentRegex.Replace(File.ReadAllText(filePath), match => new string(' ', match.Length));
            lines = content.Split('\n');
            cache[filePath] = lines;
            return lines.Length > 0;
        }
        catch
        {
            cache[filePath] = [];
            return false;
        }
    }
}
