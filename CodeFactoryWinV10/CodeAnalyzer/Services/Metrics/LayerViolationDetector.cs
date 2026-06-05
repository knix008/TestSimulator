using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.Metrics;

public static class LayerViolationDetector
{
    private static readonly (string Pattern, int Layer)[] LayerRules =
    [
        ("domain", 0),
        ("core", 0),
        ("model", 0),
        ("entities", 0),
        ("infrastructure", 1),
        ("data", 1),
        ("persistence", 1),
        ("repository", 1),
        ("application", 2),
        ("service", 2),
        ("usecase", 2),
        ("presentation", 3),
        ("ui", 3),
        ("view", 3),
        ("controller", 3),
        ("api", 3),
        ("web", 3)
    ];

    public static IReadOnlyList<(string FromFile, string ToFile, string Description)> Detect(
        FileRelationGraphResult fileRelations)
    {
        var violations = new List<(string, string, string)>();

        foreach (var edge in fileRelations.Edges)
        {
            if (!fileRelations.FileMap.TryGetValue(edge.FromFileId, out var fromFile)
                || !fileRelations.FileMap.TryGetValue(edge.ToFileId, out var toFile))
            {
                continue;
            }

            var fromLayer = ResolveLayer(fromFile.FilePath);
            var toLayer = ResolveLayer(toFile.FilePath);
            if (fromLayer < 0 || toLayer < 0 || fromLayer <= toLayer)
            {
                continue;
            }

            violations.Add((
                fromFile.FilePath,
                toFile.FilePath,
                $"계층 위반: {DescribeLayer(fromLayer)} → {DescribeLayer(toLayer)}"));
        }

        return violations;
    }

    private static int ResolveLayer(string filePath)
    {
        var path = filePath.Replace('\\', '/').ToLowerInvariant();
        var best = -1;
        foreach (var (pattern, layer) in LayerRules)
        {
            if (path.Contains($"/{pattern}/", StringComparison.Ordinal)
                || path.Contains($"\\{pattern}\\", StringComparison.OrdinalIgnoreCase)
                || path.Contains(pattern, StringComparison.Ordinal))
            {
                best = Math.Max(best, layer);
            }
        }

        return best;
    }

    private static string DescribeLayer(int layer) => layer switch
    {
        0 => "Domain/Core",
        1 => "Infrastructure/Data",
        2 => "Application/Service",
        3 => "Presentation/UI",
        _ => "Unknown"
    };
}
