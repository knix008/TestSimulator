namespace CodeAnalyzer.Models;

public static class RelationEdgeLabels
{
    public static string FormatCallCount(int callCount) => callCount > 0 ? $"호출 {callCount:N0}건" : string.Empty;
}
