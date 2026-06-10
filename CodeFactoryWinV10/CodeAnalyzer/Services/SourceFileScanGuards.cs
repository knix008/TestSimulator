namespace CodeAnalyzer.Services;

/// <summary>대형·바이너리성 소스 파일을 무거운 분석 단계에서 제외합니다.</summary>
internal static class SourceFileScanGuards
{
    internal static bool IsWithinHeavyRegexScanBudget(string? filePath) =>
        IsWithinByteBudget(filePath, AnalysisScaleLimits.MaxSourceFileBytesForHeavyRegexScan);

    internal static bool IsWithinTreeSitterBudget(string? filePath) =>
        IsWithinByteBudget(filePath, AnalysisScaleLimits.MaxSourceFileBytesForTreeSitter);

    private static bool IsWithinByteBudget(string? filePath, long maxBytes)
    {
        if (string.IsNullOrWhiteSpace(filePath))
        {
            return false;
        }

        try
        {
            var info = new FileInfo(filePath);
            return info.Exists && info.Length <= maxBytes;
        }
        catch
        {
            return false;
        }
    }
}
