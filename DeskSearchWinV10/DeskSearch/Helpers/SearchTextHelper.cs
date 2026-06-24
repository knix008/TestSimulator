using System.Text;
using System.Text.RegularExpressions;
using DeskSearch.Models;

namespace DeskSearch.Helpers;

internal static class SearchTextHelper
{
    private static readonly TimeSpan RegexTimeout = TimeSpan.FromSeconds(2);
    private static readonly Regex AndTermSeparator = new(
        @"\s+x\s+",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

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

    public static StringComparison GetComparison(bool caseSensitive) =>
        caseSensitive ? StringComparison.Ordinal : StringComparison.OrdinalIgnoreCase;

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

        var parts = SplitAndTerms(query);
        if (parts.Count == 0)
            return false;

        var terms = new List<SearchTerm>(parts.Count);

        foreach (var part in parts)
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

        resolved = new ResolvedSearchQuery
        {
            Terms = terms,
            IsInvalid = false
        };

        return true;
    }

    public static IReadOnlyList<string> SplitAndTerms(string query)
    {
        var normalized = Normalize(query.Trim());
        if (string.IsNullOrEmpty(normalized))
            return [];

        if (!AndTermSeparator.IsMatch(normalized))
            return [normalized];

        return AndTermSeparator.Split(normalized)
            .Select(part => part.Trim())
            .Where(part => part.Length > 0)
            .ToList();
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
