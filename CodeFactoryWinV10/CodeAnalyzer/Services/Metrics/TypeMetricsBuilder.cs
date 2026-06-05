using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.Metrics;

public static class TypeMetricsBuilder
{
    public static IReadOnlyList<TypeMetric> Build(
        ProjectStructureResult structure,
        IReadOnlyList<FunctionMetric> functions,
        UserAnalysisSettings thresholds)
    {
        if (structure.Types.Count == 0)
        {
            return [];
        }

        var functionsByFile = functions
            .GroupBy(func => func.FilePath, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.ToList(), StringComparer.OrdinalIgnoreCase);

        var dependencyOut = structure.Relations
            .Where(relation => relation.Kind == StructureRelationKind.Dependency)
            .GroupBy(relation => relation.FromId, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.Ordinal);

        var dependencyIn = structure.Relations
            .Where(relation => relation.Kind == StructureRelationKind.Dependency)
            .GroupBy(relation => relation.ToId, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.Ordinal);

        var inheritanceOut = structure.Relations
            .Where(relation => relation.Kind is StructureRelationKind.Inheritance or StructureRelationKind.Implementation)
            .GroupBy(relation => relation.FromId, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.Ordinal);

        var childrenCount = structure.Relations
            .Where(relation => relation.Kind is StructureRelationKind.Inheritance or StructureRelationKind.Implementation)
            .GroupBy(relation => relation.ToId, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.Ordinal);

        var inheritanceParents = structure.Relations
            .Where(relation => relation.Kind is StructureRelationKind.Inheritance or StructureRelationKind.Implementation)
            .GroupBy(relation => relation.FromId, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.Select(edge => edge.ToId).ToList(), StringComparer.Ordinal);

        var metrics = new List<TypeMetric>(structure.Types.Count);

        foreach (var type in structure.Types)
        {
            functionsByFile.TryGetValue(type.FilePath, out var fileFunctions);
            fileFunctions ??= [];

            var operationNames = new HashSet<string>(
                type.Operations,
                StringComparer.OrdinalIgnoreCase);

            var matched = fileFunctions
                .Where(func =>
                    operationNames.Contains(func.DisplayName)
                    || func.FullName.Contains(type.DisplayName, StringComparison.Ordinal)
                    || func.FullName.Contains(type.FullName, StringComparison.Ordinal))
                .ToList();

            var operationCount = Math.Max(type.Operations.Count, 1);
            var matchedRatio = matched.Count / (double)operationCount;
            var lackOfCohesion = Math.Round(Math.Clamp(1 - matchedRatio, 0, 1), 3);
            var wmc = matched.Sum(func => func.WeightedMethodComplexity > 0
                ? func.WeightedMethodComplexity
                : func.CyclomaticComplexity);
            var rfc = matched.Count + dependencyOut.GetValueOrDefault(type.Id);

            metrics.Add(new TypeMetric
            {
                Id = type.Id,
                DisplayName = type.DisplayName,
                FullName = type.FullName,
                FilePath = type.FilePath,
                LineNumber = type.LineNumber,
                Kind = type.Kind,
                MemberCount = type.Members.Count,
                OperationCount = type.Operations.Count,
                MatchedFunctionCount = matched.Count,
                MaxCyclomaticComplexity = matched.Count > 0 ? matched.Max(func => func.CyclomaticComplexity) : 0,
                MaxCognitiveComplexity = matched.Count > 0 ? matched.Max(func => func.CognitiveComplexity) : 0,
                MinMaintenanceIndex = matched.Count > 0
                    ? Math.Round(matched.Min(func => func.MaintenanceIndex), 1)
                    : 100,
                DependencyOutCount = dependencyOut.GetValueOrDefault(type.Id),
                DependencyInCount = dependencyIn.GetValueOrDefault(type.Id),
                InheritanceOutCount = inheritanceOut.GetValueOrDefault(type.Id),
                LackOfCohesion = lackOfCohesion,
                DepthOfInheritance = ComputeDepthOfInheritance(type.Id, inheritanceParents),
                NumberOfChildren = childrenCount.GetValueOrDefault(type.Id),
                WeightedMethodCount = wmc,
                ResponseForClass = rfc
            });
        }

        return metrics
            .OrderByDescending(metric =>
                metric.MemberCount + metric.OperationCount >= thresholds.WarnGodTypeMemberCount)
            .ThenByDescending(metric => metric.MaxCyclomaticComplexity)
            .ThenBy(metric => metric.DisplayName, StringComparer.CurrentCultureIgnoreCase)
            .ToList();
    }

    private static int ComputeDepthOfInheritance(
        string typeId,
        IReadOnlyDictionary<string, List<string>> inheritanceParents)
    {
        var visited = new HashSet<string>(StringComparer.Ordinal);
        return WalkDepth(typeId, inheritanceParents, visited);
    }

    private static int WalkDepth(
        string typeId,
        IReadOnlyDictionary<string, List<string>> inheritanceParents,
        HashSet<string> visited)
    {
        if (!visited.Add(typeId))
        {
            return 0;
        }

        if (!inheritanceParents.TryGetValue(typeId, out var parents) || parents.Count == 0)
        {
            return 1;
        }

        var maxParent = 0;
        foreach (var parent in parents)
        {
            maxParent = Math.Max(maxParent, WalkDepth(parent, inheritanceParents, visited));
        }

        return maxParent + 1;
    }
}
