namespace HWP2DocWinV10.Services;

internal sealed class LlmCleanupProgress
{
    public const int TotalSteps = 4;

    public required int Step { get; init; }
    public required int Percent { get; init; }
    public required string StepTitle { get; init; }
    public string? Detail { get; init; }

    public string StatusText => Detail is null
        ? $"LLM 정리 [{Step}/{TotalSteps}] {StepTitle}"
        : $"LLM 정리 [{Step}/{TotalSteps}] {StepTitle} — {Detail}";
}
