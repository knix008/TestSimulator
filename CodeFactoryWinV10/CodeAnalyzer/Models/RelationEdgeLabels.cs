namespace CodeAnalyzer.Models;

public static class RelationEdgeLabels
{
    public static string FormatCallCount(int callCount) => $"호출 {Math.Max(0, callCount):N0}건";
}
