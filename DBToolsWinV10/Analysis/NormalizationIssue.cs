namespace DBToolsWinV10.Analysis;

public class NormalizationIssue
{
	public NormalizationLevel Level { get; init; }

	public IssueSeverity Severity { get; init; }

	public string Table { get; init; } = string.Empty;

	public string AffectedColumns { get; init; } = string.Empty;

	public string Message { get; init; } = string.Empty;

	public string Hint { get; init; } = string.Empty;
}
