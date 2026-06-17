namespace DBToolsWinV10.Sample;

public sealed class SampleGenerationResult
{
	public bool Success { get; init; }

	public string Message { get; init; } = string.Empty;

	public IReadOnlyList<string> CreatedFiles { get; init; } = Array.Empty<string>();
}
