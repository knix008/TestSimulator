namespace ScreenCamWin.Models;

public class RecordingSettings
{
    public WindowInfo Target        { get; set; } = WindowInfo.Desktop;
    public int        Fps           { get; set; } = 30;
    public int        Quality       { get; set; } = 70;
    public string     OutputPath    { get; set; } = string.Empty;
    public bool       CaptureCursor { get; set; } = true;
    public CodecInfo  Codec         { get; set; } = CodecInfo.Mjpeg;
    public bool       CaptureMicrophone  { get; set; }
    public string     MicrophoneDeviceId { get; set; } = string.Empty;
    /// <summary>Microphone gain 0–100 (100 = unity).</summary>
    public int        MicrophoneGain     { get; set; } = 100;
}
