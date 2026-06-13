using System.Text.RegularExpressions;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.CallGraph.Roots;

public sealed class PythonCallGraphRootDiscovery : ICallGraphRootDiscovery
{
    private static readonly string[] ConventionEntryNames = ["main", "__main__"];
    private static readonly Regex FlaskRoutePattern = new(
        @"@(?:app|bp|blueprint)\.(?:route|get|post|put|delete|patch)\b",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);
    private static readonly Regex FastApiRoutePattern = new(
        @"@(?:app|router)\.(?:get|post|put|delete|patch|head|options|api_route)\b",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

    public string LanguageId => "python";

    public IReadOnlyList<CallGraphNode> DiscoverRoots(
        CallGraphRootDiscoveryContext context,
        CallGraphRootDiscoveryKind kind)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var roots = new List<CallGraphNode>();

        CallGraphRootDiscoverySupport.AddConventionEntryPoints(context, seen, roots, ConventionEntryNames);

        if (kind == CallGraphRootDiscoveryKind.Comprehensive)
        {
            CallGraphRootDiscoverySupport.AddFanInZeroNodes(context, seen, roots);
            AddWebFrameworkCandidates(context, seen, roots);
            CallGraphRootDiscoverySupport.AddCycleComponentRoots(context, seen, roots);
        }

        return CallGraphRootDiscoverySupport.SortRoots(roots);
    }

    private static void AddWebFrameworkCandidates(
        CallGraphRootDiscoveryContext context,
        HashSet<string> seen,
        List<CallGraphNode> roots)
    {
        var fileCache = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);

        foreach (var node in context.LanguageNodes)
        {
            if (!TryReadSourceFile(node.FilePath, fileCache, out var source))
            {
                continue;
            }

            if (!HasWebRouteDecoratorNearFunction(source, node.LineNumber))
            {
                continue;
            }

            CallGraphRootDiscoverySupport.TryAddRoot(node, seen, roots);
        }
    }

    private static bool HasWebRouteDecoratorNearFunction(string source, int lineNumber)
    {
        var lines = source.Split('\n');
        var start = Math.Max(0, lineNumber - 4);
        var end = Math.Min(lines.Length, lineNumber);
        for (var i = start; i < end; i++)
        {
            var line = lines[i];
            if (FlaskRoutePattern.IsMatch(line) || FastApiRoutePattern.IsMatch(line))
            {
                return true;
            }
        }

        return false;
    }

    private static bool TryReadSourceFile(
        string filePath,
        Dictionary<string, string?> cache,
        out string source)
    {
        source = string.Empty;
        if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
        {
            return false;
        }

        if (!cache.TryGetValue(filePath, out var cached))
        {
            try
            {
                var info = new FileInfo(filePath);
                if (info.Length > AnalysisScaleLimits.MaxSourceFileBytesForHeavyRegexScan)
                {
                    cache[filePath] = null;
                    return false;
                }

                cached = File.ReadAllText(filePath);
                cache[filePath] = cached;
            }
            catch (IOException)
            {
                cache[filePath] = null;
                return false;
            }
            catch (UnauthorizedAccessException)
            {
                cache[filePath] = null;
                return false;
            }
        }

        if (cached is null)
        {
            return false;
        }

        source = cached;
        return true;
    }
}
