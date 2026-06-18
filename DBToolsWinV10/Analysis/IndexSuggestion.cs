namespace DBToolsWinV10.Analysis;

public enum IndexSuggestionKind
{
    AlreadyIndexed,
    Required,
    Recommended,
    Consider,
}

public class IndexSuggestion
{
    public string Table { get; init; }
    public string Column { get; init; }
    public IndexSuggestionKind Kind { get; init; }
    public string Reason { get; init; }
    public string Recommendation { get; init; }
}
