using System.Text.RegularExpressions;

namespace DeskSearch.Models;

public sealed class ResolvedSearchQuery
{
    public static ResolvedSearchQuery Invalid { get; } = new()
    {
        OrGroups = [],
        IsInvalid = true,
        IsRegexQuery = false
    };

    public required IReadOnlyList<SearchAndGroup> OrGroups { get; init; }

    public bool IsInvalid { get; init; }

    public bool IsRegexQuery { get; init; }

    public IReadOnlyList<SearchTerm> Terms =>
        OrGroups.SelectMany(group => group.Terms).ToList();

    /// <summary>Literal and wildcard queries run in SQLite (FTS/LIKE). Regex scans the index in batches.</summary>
    public bool CanUseSqlScored => !IsInvalid && !IsRegexQuery && Terms.Count > 0;

    public bool CanUseFts => CanUseSqlScored;

    public bool UsesPatternMatch => Terms.Any(term => term.Pattern is not null);

    public bool IsOrQuery => OrGroups.Count > 1;

    public bool IsAndQuery => OrGroups.Count == 1 && OrGroups[0].Terms.Count > 1;
}

public sealed class SearchAndGroup
{
    public required IReadOnlyList<SearchTerm> Terms { get; init; }
}

public sealed record SearchTerm
{
    public string Text { get; }

    public Regex? Pattern { get; }

    public string NormalizedText { get; }

    public SearchTerm(string text, Regex? pattern)
    {
        Text = text;
        Pattern = pattern;
        NormalizedText = Helpers.SearchTextHelper.NormalizeSearchTerm(text);
    }
}
