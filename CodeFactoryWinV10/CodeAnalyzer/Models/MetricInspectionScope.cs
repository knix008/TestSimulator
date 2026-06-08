namespace CodeAnalyzer.Models;

public static class MetricInspectionScope
{
    public static MetricInspectionKind Normalize(MetricInspectionKind scope)
    {
        if (scope is MetricInspectionKind.None or 0)
            return MetricInspectionKind.All;

        // DuplicateCodeGroups and FileDuplicateLines both require the same expensive scan.
        // Keep them in sync: if either is on, treat both as on for display and analysis.
        var dupBits = MetricInspectionKind.DuplicateCodeGroups | MetricInspectionKind.FileDuplicateLines;
        var dupState = scope & dupBits;
        if (dupState != 0 && dupState != dupBits)
        {
            scope |= dupBits;
        }

        return scope;
    }

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
