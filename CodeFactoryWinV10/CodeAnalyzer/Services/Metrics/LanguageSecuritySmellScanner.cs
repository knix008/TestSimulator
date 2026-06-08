using CodeAnalyzer.Models;

using System.Text.RegularExpressions;

namespace CodeAnalyzer.Services.Metrics;

internal static class LanguageSecuritySmellScanner
{
    public static IReadOnlyList<SecuritySmellHit> Scan(string source, string? languageId)
    {
        if (string.IsNullOrEmpty(source))
        {
            return [];
        }

        var hits = new List<SecuritySmellHit>();
        var seen = new HashSet<string>(StringComparer.Ordinal);

        foreach (var rule in LanguageSecuritySmellCatalog.GetRulesForLanguage(languageId))
        {
            foreach (Match match in rule.Pattern.Matches(source))
            {
                var line = LineNumberOf(source, match.Index);
                var key = $"{rule.Id}:{line}:{match.Index}";
                if (!seen.Add(key))
                {
                    continue;
                }

                hits.Add(new SecuritySmellHit
                {
                    RuleId = rule.Id,
                    Label = rule.Label,
                    LineNumber = line
                });
            }
        }

        return hits;
    }

    public static string FormatSummary(IReadOnlyList<SecuritySmellHit> hits, int maxItems = 4)
    {
        if (hits.Count == 0)
        {
            return string.Empty;
        }

        return string.Join(" · ",
            hits.GroupBy(hit => hit.Label, StringComparer.Ordinal)
                .OrderByDescending(group => group.Count())
                .ThenBy(group => group.Key, StringComparer.Ordinal)
                .Take(maxItems)
                .Select(group => $"{group.Key}×{group.Count()}"));
    }

    private static int LineNumberOf(string source, int index)
    {
        if (index <= 0)
        {
            return 1;
        }

        var line = 1;
        for (var i = 0; i < index && i < source.Length; i++)
        {
            if (source[i] == '\n')
            {
                line++;
            }
        }

        return line;
    }
}
