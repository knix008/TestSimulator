namespace CodeAnalyzer.Services;

internal static class AnalysisCancellation
{
    public static bool IsCancellation(Exception exception) =>
        exception is OperationCanceledException;
}
