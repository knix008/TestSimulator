namespace CodeAnalyzer.Services.Database;

/// <summary>DB 범용(오픈소스·Microsoft) + 언어별 DB API 신호·SQL 인자 추출 통합.</summary>
internal static class RelationalDbAccessPatterns
{
    internal static bool HasSignal(string body, string languageId = "") =>
        OpenSourceRelationalDbPatterns.HasSignal(body)
        || MicrosoftRelationalDbPatterns.HasSignal(body)
        || LanguageDbAccessPatterns.HasDbExecutionSignal(body, languageId);

    internal static void ScanAllNativeSqlArguments(string body, string languageId, Action<string> scanSql)
    {
        OpenSourceRelationalDbPatterns.ScanNativeApiSqlArguments(body, scanSql);
        MicrosoftRelationalDbPatterns.ScanSqlStringArguments(body, scanSql);
        LanguageDbAccessPatterns.ScanNativeSqlArguments(body, languageId, scanSql);
    }
}
