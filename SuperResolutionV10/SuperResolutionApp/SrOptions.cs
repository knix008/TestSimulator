namespace SuperResolutionApp;

public sealed class SrOptions
{
    public required SrAlgorithm Algorithm { get; init; }
    public required int Scale { get; init; }
    public string? ModelPath { get; init; }
}
