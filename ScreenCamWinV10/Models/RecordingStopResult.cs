namespace ScreenCamWin.Models;

public sealed class RecordingStopResult
{
    public required RecordingOutputPaths OutputPaths { get; init; }

    /// <summary>True when recording used separate mic WAV for post-merge.</summary>
    public bool CaptureMicrophone { get; init; }

    public string? TempDirectory { get; init; }
    public string? TempVideoPath { get; init; }
    public string? TempAudioPath { get; init; }

    /// <summary>True when mic was on and separate temp video + audio should be merged.</summary>
    public bool RequiresMerge =>
        CaptureMicrophone
        && !string.IsNullOrEmpty(TempVideoPath)
        && !string.IsNullOrEmpty(TempAudioPath)
        && File.Exists(TempVideoPath)
        && File.Exists(TempAudioPath);
}
