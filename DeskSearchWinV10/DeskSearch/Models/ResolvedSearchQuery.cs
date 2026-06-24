using System.Text.RegularExpressions;

namespace DeskSearch.Models;

public sealed class ResolvedSearchQuery
{
    public static ResolvedSearchQuery Invalid { get; } = new()
    {
        Terms = [],
        IsInvalid = true
    };

    public required IReadOnlyList<SearchTerm> Terms { get; init; }

    public bool IsInvalid { get; init; }

    public bool IsAndQuery => Terms.Count > 1;

    public bool UsesPatternMatch => Terms.Any(term => term.Pattern is not null);

    public bool CanUseFts => !IsInvalid && Terms.Count > 0 && Terms.All(term => term.Pattern is null);
}

public sealed record SearchTerm(string Text, Regex? Pattern);
