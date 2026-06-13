using System.Text.RegularExpressions;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.CallGraph.Roots;

public sealed class CSharpCallGraphRootDiscovery : ICallGraphRootDiscovery
{
    private static readonly string[] ConventionEntryNames = ["Main"];
    private static readonly Regex FrameworkAttributePattern = new(
        @"\[(?:Http(?:Get|Post|Put|Delete|Patch|Head|Options)|Route|ApiController|Endpoint|STAThread|WebMethod|EventHandler|Subscribe|Handle)\b",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Regex WinFormsEventHandlerPattern = new(
        @"^(?:On[A-Z]|.*(?:Click|Load|Shown|Closing|Closed|Changed|Selected|DoubleClick|KeyDown|KeyUp|Paint|Resize|FormClosed|FormClosing|TextChanged|CheckedChanged|SelectedIndexChanged))$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public string LanguageId => "csharp";

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
            AddFrameworkCandidates(context, seen, roots);
            CallGraphRootDiscoverySupport.AddCycleComponentRoots(context, seen, roots);
        }

        return CallGraphRootDiscoverySupport.SortRoots(roots);
    }

    private static void AddFrameworkCandidates(
        CallGraphRootDiscoveryContext context,
        HashSet<string> seen,
        List<CallGraphNode> roots)
    {
        var fileCache = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);

        foreach (var node in context.LanguageNodes)
        {
            if (WinFormsEventHandlerPattern.IsMatch(node.DisplayName))
            {
                CallGraphRootDiscoverySupport.TryAddRoot(node, seen, roots);
                continue;
            }

            if (!TryReadSourceFile(node.FilePath, fileCache, out var source))
            {
                continue;
            }

            if (!HasFrameworkAttributeNearMethod(source, node.LineNumber))
            {
                continue;
            }

            CallGraphRootDiscoverySupport.TryAddRoot(node, seen, roots);
        }
    }

    private static bool HasFrameworkAttributeNearMethod(string source, int lineNumber)
    {
        var lines = source.Split('\n');
        var start = Math.Max(0, lineNumber - 6);
        var end = Math.Min(lines.Length, lineNumber + 1);
        for (var i = start; i < end; i++)
        {
            if (FrameworkAttributePattern.IsMatch(lines[i]))
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
        if (string.IsNullOrWhiteSpace(filePath))
        {
            return false;
        }

        if (!cache.TryGetValue(filePath, out var cached))
        {
            try
            {
                if (!File.Exists(filePath))
                {
                    cache[filePath] = null;
                    return false;
                }

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
