using CodeAnalyzer.Services;

namespace CodeAnalyzer.Services.Database;

/// <summary>Java/Kotlin/JavaScript·TypeScript 전용 DB 분석 범위 (C/C++ 등 다른 언어에 영향 없음).</summary>
internal static class JvmJsDbAnalysisScope
{
    private static readonly HashSet<string> LanguageIds = new(StringComparer.OrdinalIgnoreCase)
    {
        "java", "kotlin", "javascript"
    };

    internal static bool IsTargetLanguage(string? languageId) =>
        !string.IsNullOrWhiteSpace(languageId) && LanguageIds.Contains(languageId);

    internal static bool IsTargetFile(string? filePath)
    {
        if (string.IsNullOrWhiteSpace(filePath))
        {
            return false;
        }

        var language = LanguageRegistry.FindByExtension(Path.GetExtension(filePath));
        return language is not null && LanguageIds.Contains(language.Id);
    }
}
