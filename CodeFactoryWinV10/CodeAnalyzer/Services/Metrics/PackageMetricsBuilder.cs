using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.Metrics;

public static class PackageMetricsBuilder
{
    public static IReadOnlyList<PackageMetric> Build(
        FileRelationGraphResult fileRelations,
        IReadOnlyList<FileLineMetric> files,
        string? projectRoot)
    {
        if (fileRelations.Files.Count == 0)
        {
            return [];
        }

        var packageByFile = files.ToDictionary(
            file => file.FilePath,
            file => ResolvePackageKey(file.FilePath, projectRoot),
            StringComparer.OrdinalIgnoreCase);

        foreach (var file in fileRelations.Files)
        {
            packageByFile.TryAdd(file.FilePath, ResolvePackageKey(file.FilePath, projectRoot));
        }

        var ca = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);
        var ce = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);
        var abstractTypes = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var concreteTypes = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        foreach (var file in fileRelations.Files)
        {
            var package = packageByFile.GetValueOrDefault(file.FilePath, ResolvePackageKey(file.FilePath, projectRoot));
            if (file.FilePath.Contains("Interface", StringComparison.OrdinalIgnoreCase)
                || file.FilePath.Contains("Abstract", StringComparison.OrdinalIgnoreCase))
            {
                abstractTypes[package] = abstractTypes.GetValueOrDefault(package) + 1;
            }
            else
            {
                concreteTypes[package] = concreteTypes.GetValueOrDefault(package) + 1;
            }
        }

        foreach (var edge in fileRelations.Edges)
        {
            if (!fileRelations.FileMap.TryGetValue(edge.FromFileId, out var fromFile)
                || !fileRelations.FileMap.TryGetValue(edge.ToFileId, out var toFile))
            {
                continue;
            }

            var fromPackage = packageByFile.GetValueOrDefault(fromFile.FilePath, ResolvePackageKey(fromFile.FilePath, projectRoot));
            var toPackage = packageByFile.GetValueOrDefault(toFile.FilePath, ResolvePackageKey(toFile.FilePath, projectRoot));
            if (fromPackage.Equals(toPackage, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            ce.TryAdd(fromPackage, new HashSet<string>(StringComparer.OrdinalIgnoreCase));
            ce[fromPackage].Add(toPackage);

            ca.TryAdd(toPackage, new HashSet<string>(StringComparer.OrdinalIgnoreCase));
            ca[toPackage].Add(fromPackage);
        }

        var packages = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var key in packageByFile.Values)
        {
            packages.Add(key);
        }

        var metrics = new List<PackageMetric>(packages.Count);
        foreach (var package in packages.OrderBy(path => path, StringComparer.OrdinalIgnoreCase))
        {
            var afferent = ca.GetValueOrDefault(package)?.Count ?? 0;
            var efferent = ce.GetValueOrDefault(package)?.Count ?? 0;
            var total = afferent + efferent;
            var instability = total > 0 ? Math.Round((double)efferent / total, 3) : 0;
            var abstractCount = abstractTypes.GetValueOrDefault(package);
            var concreteCount = concreteTypes.GetValueOrDefault(package);
            var typeTotal = abstractCount + concreteCount;
            var abstractness = typeTotal > 0 ? Math.Round((double)abstractCount / typeTotal, 3) : 0;
            var distance = Math.Round(Math.Abs(1 - instability - abstractness), 3);

            metrics.Add(new PackageMetric
            {
                DirectoryPath = package,
                AfferentCoupling = afferent,
                EfferentCoupling = efferent,
                Instability = instability,
                Abstractness = abstractness,
                DistanceFromMainSequence = distance
            });
        }

        return metrics;
    }

    private static string ResolvePackageKey(string filePath, string? projectRoot)
    {
        var fullPath = Path.GetFullPath(filePath);
        if (!string.IsNullOrWhiteSpace(projectRoot))
        {
            var root = Path.GetFullPath(projectRoot);
            if (fullPath.StartsWith(root, StringComparison.OrdinalIgnoreCase))
            {
                var relative = Path.GetRelativePath(root, fullPath);
                var parts = relative.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                return parts.Length > 1 ? parts[0] : ".";
            }
        }

        var directory = Path.GetDirectoryName(fullPath) ?? ".";
        return directory;
    }
}
