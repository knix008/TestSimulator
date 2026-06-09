namespace CodeAnalyzer.Models;

public static class MetricInspectionScope
{
    public static MetricInspectionKind Normalize(MetricInspectionKind scope)
    {
        if (scope is MetricInspectionKind.None or 0)
            return MetricInspectionKind.All;

        // FileDuplicateLines는 DuplicateCodeGroups와 같은 스캔을 사용.
        // DuplicateCodeGroups 활성 시 자동으로 함께 켜짐 (UI에는 별도 항목 없음).
        if ((scope & MetricInspectionKind.DuplicateCodeGroups) != 0)
        {
            scope |= MetricInspectionKind.FileDuplicateLines;
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
