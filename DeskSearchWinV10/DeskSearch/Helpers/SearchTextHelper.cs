using System.Text;
using System.Text.RegularExpressions;
using DeskSearch.Models;

namespace DeskSearch.Helpers;

internal static class SearchTextHelper
{
    private static readonly TimeSpan RegexTimeout = TimeSpan.FromSeconds(2);

    // Operators must be surrounded by whitespace: "a + b" (OR), "a * b" (AND).
    private static readonly Regex OrTermSeparator = new(
        @"\s+\+\s+",
        RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static readonly Regex AndTermSeparator = new(
        @"\s+\*\s+",
        RegexOptions.CultureInvariant | RegexOptions.Compiled);

    /// <summary>
    /// Normalizes text for cross-language file name matching (NFC).
    /// UI language is limited to ko/en; search itself is language-agnostic.
    /// </summary>
    public static string Normalize(string value)
    {
        if (string.IsNullOrEmpty(value))
            return value;

        return value.Normalize(NormalizationForm.FormC);
    }

    /// <summary>
    /// Normalizes a user search term. Path-like input (e.g. pasted from Explorer) is reduced
    /// to the final name segment so search never runs against full paths.
    /// </summary>
    public static string NormalizeSearchTerm(string term)
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

    /// <summary>
    /// Immediate parent folder name only — a single path segment, never a full path.
    /// </summary>
    public static string NormalizeParentDirectoryName(string parentDirectoryPath)
    {
        var segment = FileEntry.ResolveDirectoryName(parentDirectoryPath);
        if (string.IsNullOrEmpty(segment))
            return string.Empty;

        if (segment.Contains('\\') || segment.Contains('/'))
            segment = Path.GetFileName(segment.TrimEnd('\\', '/')) ?? string.Empty;

        return Normalize(segment);
    }

    public static StringComparison GetComparison(bool caseSensitive) =>
        caseSensitive ? StringComparison.Ordinal : StringComparison.OrdinalIgnoreCase;

    public static int ScoreLiteralFileName(string name, string query, StringComparison comparison) =>
        ScoreLiteralNameSegment(name, query, comparison, exact: 100, prefix: 80, contains: 60);

    /// <summary>Scores against the entry name: file name for files, folder name for directories.</summary>
    public static int ScoreLiteralEntry(FileEntry entry, string query, StringComparison comparison) =>
        ScoreLiteralFileName(entry.SearchFileName, query, comparison);

    private static int ScoreLiteralNameSegment(
        string name,
        string query,
        StringComparison comparison,
        int exact,
        int prefix,
        int contains)
    {
        if (string.IsNullOrEmpty(name))
            return 0;

        var term = Normalize(query.Trim());
        if (term.Length == 0)
            return 0;

        var text = Normalize(name);
        if (text.Equals(term, comparison))
            return exact;

        if (text.StartsWith(term, comparison))
            return prefix;

        if (text.Contains(term, comparison))
            return contains;

        return 0;
    }

    public static string WildcardToContainsLike(string pattern)
    {
        var builder = new StringBuilder(pattern.Length * 2);

        for (var i = 0; i < pattern.Length; i++)
        {
            var c = pattern[i];
            if (c == '\\' && i + 1 < pattern.Length)
            {
                AppendLikeLiteral(builder, pattern[++i]);
                continue;
            }

            switch (c)
            {
                case '*':
                    builder.Append('%');
                    break;
                case '?':
                    builder.Append('_');
                    break;
                default:
                    AppendLikeLiteral(builder, c);
                    break;
            }
        }

        return builder.ToString();
    }

    public static (string? Exact, string PrefixLike, string ContainsLike) GetWildcardLikePatterns(string pattern)
    {
        var trimmed = pattern.Trim();
        var containsLike = WildcardToContainsLike(trimmed);

        if (!ContainsWildcards(trimmed))
            return (NormalizeSearchTerm(trimmed), containsLike, containsLike);

        var startsWithStar = trimmed.StartsWith('*');
        var endsWithStar = trimmed.EndsWith('*');
        string? exact = null;
        string prefixLike = containsLike;

        if (endsWithStar && !startsWithStar && trimmed.IndexOf('?', StringComparison.Ordinal) < 0)
        {
            var prefix = trimmed.TrimEnd('*');
            if (prefix.Length > 0)
            {
                exact = NormalizeSearchTerm(prefix);
                prefixLike = EscapeLike(exact) + "%";
            }
        }

        return (exact, prefixLike, containsLike);
    }

    private static void AppendLikeLiteral(StringBuilder builder, char c)
    {
        if (c is '%' or '_' or '\\')
            builder.Append('\\');

        builder.Append(c);
    }

    private static string EscapeLike(string value) =>
        value.Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("%", "\\%", StringComparison.Ordinal)
            .Replace("_", "\\_", StringComparison.Ordinal);

    public static bool ContainsWildcards(string pattern)
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

    public static bool TryResolveSearchQuery(
        string query,
        bool useRegexSetting,
        bool caseSensitive,
        out ResolvedSearchQuery resolved)
    {
        resolved = ResolvedSearchQuery.Invalid;

        if (string.IsNullOrWhiteSpace(query))
            return false;

        var groupParts = ParseOrGroups(query);
        if (groupParts.Count == 0)
            return false;

        var orGroups = new List<SearchAndGroup>(groupParts.Count);

        foreach (var andParts in groupParts)
        {
            var terms = new List<SearchTerm>(andParts.Count);

            foreach (var part in andParts)
            {
                if (useRegexSetting)
                {
                    if (!TryCreateRegex(part, caseSensitive, out var regex))
                        return false;

                    terms.Add(new SearchTerm(part, regex));
                    continue;
                }

                if (ContainsWildcards(part))
                {
                    if (!TryCreateWildcardRegex(part, caseSensitive, out var regex))
                        return false;

                    terms.Add(new SearchTerm(part, regex));
                    continue;
                }

                terms.Add(new SearchTerm(part, null));
            }

            orGroups.Add(new SearchAndGroup { Terms = terms });
        }

        resolved = new ResolvedSearchQuery
        {
            OrGroups = orGroups,
            IsInvalid = false,
            IsRegexQuery = useRegexSetting
        };

        return true;
    }

    /// <summary>
    /// Splits a query into OR groups of AND term lists.
    /// "a * b + c" → [["a","b"], ["c"]].
    /// </summary>
    public static IReadOnlyList<IReadOnlyList<string>> ParseOrGroups(string query)
    {
        var normalized = Normalize(query.Trim());
        if (string.IsNullOrEmpty(normalized))
            return [];

        var orParts = OrTermSeparator.Split(normalized)
            .Select(part => part.Trim())
            .Where(part => part.Length > 0)
            .ToList();

        if (orParts.Count == 0)
            return [];

        var groups = new List<IReadOnlyList<string>>(orParts.Count);

        foreach (var orPart in orParts)
        {
            IReadOnlyList<string> andParts = AndTermSeparator.IsMatch(orPart)
                ? AndTermSeparator.Split(orPart)
                    .Select(part => part.Trim())
                    .Where(part => part.Length > 0)
                    .ToList()
                : [orPart];

            if (andParts.Count > 0)
                groups.Add(andParts);
        }

        return groups;
    }

    public static bool TryCreateRegex(string pattern, bool caseSensitive, out Regex? regex)
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

    public static bool TryCreateWildcardRegex(string pattern, bool caseSensitive, out Regex? regex)
    {
        regex = null;
        if (string.IsNullOrWhiteSpace(pattern))
            return false;

        try
        {
            var regexPattern = WildcardToRegexPattern(pattern);
            var options = RegexOptions.CultureInvariant | RegexOptions.Compiled | RegexOptions.Singleline;
            if (!caseSensitive)
                options |= RegexOptions.IgnoreCase;

            regex = new Regex(regexPattern, options, RegexTimeout);
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

        for (var i = 0; i < pattern.Length; i++)
        {
            var c = pattern[i];
            if (c == '\\' && i + 1 < pattern.Length)
            {
                builder.Append(Regex.Escape(pattern[++i].ToString()));
                continue;
            }

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
}
