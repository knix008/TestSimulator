using MyWorkspace.Core.Models;

namespace MyWorkspace.Core.Templates;

public static class TemplateLanguage
{
    public const string Korean = "ko";
    public const string English = "en";

    public static string Normalize(string? languageCode) =>
        string.Equals(languageCode, English, StringComparison.OrdinalIgnoreCase) ? English : Korean;

    public static bool MatchesFilter(PageTemplate template, string filterLanguage)
    {
        if (string.IsNullOrWhiteSpace(template.Language))
            return true;

        return string.Equals(template.Language, Normalize(filterLanguage), StringComparison.OrdinalIgnoreCase);
    }
}
