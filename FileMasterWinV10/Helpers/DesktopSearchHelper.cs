using System.Text;
using System.Text.RegularExpressions;

namespace FileMasterWinV10.Helpers;

public enum SearchResultSortOrder
{
    MatchQuality,
    NameAsc,
    NameDesc,
    PathAsc,
    PathDesc,
    ModifiedDesc
}

public sealed class FileSearchOptions
{
    public bool CaseSensitive { get; init; }
    public bool UseRegex { get; init; }
    public bool IncludeFolders { get; init; }
    public SearchResultSortOrder SortOrder { get; init; } = SearchResultSortOrder.MatchQuality;
}

internal static class DesktopSearchHelper
{
    private static readonly TimeSpan RegexTimeout = TimeSpan.FromSeconds(2);
    private static readonly Regex OrTermSeparator = new(@"\s+\+\s+", RegexOptions.CultureInvariant | RegexOptions.Compiled);
    private static readonly Regex AndTermSeparator = new(@"\s+\*\s+", RegexOptions.CultureInvariant | RegexOptions.Compiled);

    public static bool TryCreateQuery(string query, FileSearchOptions options, out DesktopSearchQuery resolved)
    {
        resolved = DesktopSearchQuery.Invalid;
        if (string.IsNullOrWhiteSpace(query))
            return false;

        var groups = ParseOrGroups(Normalize(query.Trim()));
        if (groups.Count == 0)
            return false;

        var resolvedGroups = new List<IReadOnlyList<SearchTerm>>(groups.Count);
        foreach (var group in groups)
        {
            var terms = new List<SearchTerm>(group.Count);
            foreach (var part in group)
            {
                if (options.UseRegex)
                {
                    if (!TryCreateRegex(part, options.CaseSensitive, out var regex))
                        return false;

                    terms.Add(new SearchTerm(part, NormalizeSearchTerm(part), regex));
                    continue;
                }

                if (ContainsWildcards(part))
                {
                    if (!TryCreateWildcardRegex(part, options.CaseSensitive, out var regex))
                        return false;

                    terms.Add(new SearchTerm(part, NormalizeSearchTerm(part), regex));
                    continue;
                }

                terms.Add(new SearchTerm(part, NormalizeSearchTerm(part), null));
            }

            if (terms.Count > 0)
                resolvedGroups.Add(terms);
        }

        if (resolvedGroups.Count == 0)
            return false;

        resolved = new DesktopSearchQuery(resolvedGroups, IsInvalid: false);
        return true;
    }

    public static int ScoreName(string name, DesktopSearchQuery query, bool caseSensitive)
    {
        if (query.IsInvalid || string.IsNullOrEmpty(name))
            return 0;

        var comparison = caseSensitive ? StringComparison.Ordinal : StringComparison.OrdinalIgnoreCase;
        var normalizedName = Normalize(name);
        var best = 0;

        foreach (var group in query.OrGroups)
        {
            var groupScore = int.MaxValue;
            foreach (var term in group)
            {
                var score = term.Pattern is not null
                    ? ScoreRegexName(normalizedName, term.Pattern)
                    : ScoreLiteralName(normalizedName, term.NormalizedText, comparison);

                if (score == 0)
                {
                    groupScore = 0;
                    break;
                }

                groupScore = Math.Min(groupScore, score);
            }

            if (groupScore > best)
                best = groupScore;
        }

        return best;
    }

    public static IReadOnlyList<SearchMatch> SortMatches(
        IEnumerable<SearchMatch> matches,
        SearchResultSortOrder sortOrder,
        bool caseSensitive)
    {
        var comparer = caseSensitive ? StringComparer.Ordinal : StringComparer.OrdinalIgnoreCase;
        return sortOrder switch
        {
            SearchResultSortOrder.NameAsc => matches
                .OrderBy(x => x.Name, comparer)
                .ThenBy(x => x.FullPath, comparer)
                .ToList(),
            SearchResultSortOrder.NameDesc => matches
                .OrderByDescending(x => x.Name, comparer)
                .ThenByDescending(x => x.FullPath, comparer)
                .ToList(),
            SearchResultSortOrder.PathAsc => matches
                .OrderBy(x => x.FullPath, comparer)
                .ThenBy(x => x.Name, comparer)
                .ToList(),
            SearchResultSortOrder.PathDesc => matches
                .OrderByDescending(x => x.FullPath, comparer)
                .ThenByDescending(x => x.Name, comparer)
                .ToList(),
            SearchResultSortOrder.ModifiedDesc => matches
                .OrderByDescending(x => x.ModifiedUtc)
                .ThenBy(x => x.Name, comparer)
                .ToList(),
            _ => matches
                .OrderByDescending(x => x.Score)
                .ThenBy(x => x.Name, comparer)
                .ThenBy(x => x.FullPath, comparer)
                .ToList(),
        };
    }

    private static string Normalize(string value) =>
        string.IsNullOrEmpty(value) ? value : value.Normalize(NormalizationForm.FormC);

    private static string NormalizeSearchTerm(string term)
    {
        if (string.IsNullOrWhiteSpace(term))
            return string.Empty;

        var trimmed = term.Trim();
        if ((trimmed.Contains('\\') || trimmed.Contains('/')) && !ContainsWildcards(trimmed))
        {
            var last = Path.GetFileName(trimmed.TrimEnd('\\', '/'));
            if (!string.IsNullOrEmpty(last))
                trimmed = last;
        }

        return Normalize(trimmed);
    }

    private static IReadOnlyList<IReadOnlyList<string>> ParseOrGroups(string query)
    {
        var orParts = OrTermSeparator.Split(query)
            .Select(part => part.Trim())
            .Where(part => part.Length > 0)
            .ToList();

        var groups = new List<IReadOnlyList<string>>(orParts.Count);
        foreach (var orPart in orParts)
        {
            var andParts = AndTermSeparator.IsMatch(orPart)
                ? AndTermSeparator.Split(orPart).Select(part => part.Trim()).Where(part => part.Length > 0).ToList()
                : [orPart];

            if (andParts.Count > 0)
                groups.Add(andParts);
        }

        return groups;
    }

    private static bool ContainsWildcards(string pattern)
    {
        for (var i = 0; i < pattern.Length; i++)
        {
            if (pattern[i] == '\\' && i + 1 < pattern.Length)
            {
                i++;
                continue;
            }

            if (pattern[i] is '*' or '?')
                return true;
        }

        return false;
    }

    private static bool TryCreateRegex(string pattern, bool caseSensitive, out Regex? regex)
    {
        regex = null;
        if (string.IsNullOrWhiteSpace(pattern))
            return false;

        try
        {
            var options = RegexOptions.CultureInvariant | RegexOptions.Compiled;
            if (!caseSensitive)
                options |= RegexOptions.IgnoreCase;

            regex = new Regex(pattern, options, RegexTimeout);
            return true;
        }
        catch (ArgumentException)
        {
            return false;
        }
        catch (RegexMatchTimeoutException)
        {
            return false;
        }
    }

    private static bool TryCreateWildcardRegex(string pattern, bool caseSensitive, out Regex? regex)
    {
        regex = null;
        try
        {
            var options = RegexOptions.CultureInvariant | RegexOptions.Compiled | RegexOptions.Singleline;
            if (!caseSensitive)
                options |= RegexOptions.IgnoreCase;

            regex = new Regex(WildcardToRegexPattern(pattern), options, RegexTimeout);
            return true;
        }
        catch (ArgumentException)
        {
            return false;
        }
        catch (RegexMatchTimeoutException)
        {
            return false;
        }
    }

    private static string WildcardToRegexPattern(string pattern)
    {
        var builder = new StringBuilder(pattern.Length * 2);

        foreach (var c in pattern)
        {
            switch (c)
            {
                case '*':
                    builder.Append(".*");
                    break;
                case '?':
                    builder.Append('.');
                    break;
                default:
                    builder.Append(Regex.Escape(c.ToString()));
                    break;
            }
        }

        return builder.ToString();
    }

    private static int ScoreLiteralName(string name, string query, StringComparison comparison)
    {
        if (query.Length == 0)
            return 0;
        if (name.Equals(query, comparison))
            return 100;
        if (name.StartsWith(query, comparison))
            return 80;
        return name.Contains(query, comparison) ? 60 : 0;
    }

    private static int ScoreRegexName(string text, Regex regex)
    {
        var match = regex.Match(text);
        if (!match.Success)
            return 0;
        if (match.Index == 0 && match.Length == text.Length)
            return 100;
        if (match.Index == 0)
            return 80;
        return 60;
    }
}

internal sealed record DesktopSearchQuery(IReadOnlyList<IReadOnlyList<SearchTerm>> OrGroups, bool IsInvalid)
{
    public static DesktopSearchQuery Invalid { get; } = new([], IsInvalid: true);
}

internal sealed record SearchTerm(string Text, string NormalizedText, Regex? Pattern);

internal sealed record SearchMatch(string FullPath, string Name, long ModifiedUtc, int Score);