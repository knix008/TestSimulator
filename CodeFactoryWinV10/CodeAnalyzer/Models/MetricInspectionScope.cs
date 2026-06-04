namespace CodeAnalyzer.Models;

public static class MetricInspectionScope
{
    public static MetricInspectionKind Normalize(MetricInspectionKind scope) =>
        scope is MetricInspectionKind.None or 0 ? MetricInspectionKind.All : scope;

    public static bool IsEnabled(MetricInspectionKind scope, MetricInspectionKind flag) =>
        (Normalize(scope) & flag) != 0;

    public static MetricInspectionKind FromCheckedKinds(IEnumerable<MetricInspectionKind> kinds)
    {
        MetricInspectionKind combined = 0;
        foreach (var kind in kinds)
        {
            combined |= kind;
        }

        return Normalize(combined);
    }
}
