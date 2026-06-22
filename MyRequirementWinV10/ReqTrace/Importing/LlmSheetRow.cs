namespace ReqTrace.Importing;

public sealed class LlmSheetRow
{
    public bool IsSection { get; init; }
    public string? SectionText { get; init; }
    public string CategoryContext { get; init; } = string.Empty;
    public required IReadOnlyList<string> Headers { get; init; }
    public required IReadOnlyList<string> Values { get; init; }
    public required string CsvLine { get; init; }
}
