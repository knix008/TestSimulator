namespace CodeAnalyzer.Services.Database;

/// <summary>
/// DB 접근·카탈로그 스캔에서 제외할 분석기 내부/휴리스틱 소스 파일.
/// (다른 프로젝트에는 보통 존재하지 않습니다.)
/// </summary>
internal static class DatabaseAccessScanExclusions
{
    private static readonly HashSet<string> DenyFileNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "DatabaseTableAccessAnalyzer.cs",
        "DatabaseCatalogAccessAnalyzer.cs",
        "SqlPatternHelper.cs",
        "MicrosoftRelationalDbPatterns.cs",
        "OpenSourceRelationalDbPatterns.cs",
        "UniversalDatabasePatterns.cs",
        "RelationalDbAccessPatterns.cs",
        "LanguageDbAccessPatterns.cs",
        "JvmJsDbAnalysisScope.cs",
        "SqlInCodeSchemaExtractor.cs",
        "DatabaseSchemaInitializer.cs",
    };

    internal static bool ShouldScanFile(string? filePath)
    {
        if (string.IsNullOrWhiteSpace(filePath))
        {
            return false;
        }

        return !DenyFileNames.Contains(Path.GetFileName(filePath));
    }
}
