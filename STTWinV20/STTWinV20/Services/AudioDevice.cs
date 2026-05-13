namespace STTWinV20.Services;

public class AudioDevice
{
    public int DeviceNumber { get; set; }
    public string DeviceName { get; set; } = string.Empty;
    public override string ToString() => DeviceName;
}
