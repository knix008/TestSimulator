using System.Text.RegularExpressions;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.CallGraph.Roots;

public sealed class JavaCallGraphRootDiscovery : ICallGraphRootDiscovery
{
    private static readonly string[] ConventionEntryNames = ["main"];
    private static readonly Regex SpringMappingPattern = new(
        @"@(?:Get|Post|Put|Delete|Patch|Request|Scheduled|EventListener|PostConstruct|PreDestroy|Bean|Transactional|Test)Mapping\b|@(?:Get|Post|Put|Delete|Patch|Request|Scheduled|EventListener|PostConstruct|PreDestroy|Bean|Transactional|Test)\b",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public string LanguageId => "java";

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
            AddSpringCandidates(context, seen, roots);
            CallGraphRootDiscoverySupport.AddCycleComponentRoots(context, seen, roots);
        }

        return CallGraphRootDiscoverySupport.SortRoots(roots);
    }

    private static void AddSpringCandidates(
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

            if (!HasSpringAnnotationNearMethod(source, node.LineNumber))
            {
                continue;
            }

            CallGraphRootDiscoverySupport.TryAddRoot(node, seen, roots);
        }
    }

    private static bool HasSpringAnnotationNearMethod(string source, int lineNumber)
    {
        var lines = source.Split('\n');
        var start = Math.Max(0, lineNumber - 6);
        var end = Math.Min(lines.Length, lineNumber + 1);
        for (var i = start; i < end; i++)
        {
            if (SpringMappingPattern.IsMatch(lines[i]))
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
