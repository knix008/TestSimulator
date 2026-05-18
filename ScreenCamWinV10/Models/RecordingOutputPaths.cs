namespace ScreenCamWin.Models;

/// <summary>Final layout: one session folder with video, audio, and merged files.</summary>
public sealed class RecordingOutputPaths
{
    public required string SessionDirectory { get; init; }
    public required string VideoPath { get; init; }
    public string? AudioPath { get; init; }
    public string? MergedPath { get; init; }
}
