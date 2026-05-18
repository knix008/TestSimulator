namespace ScreenCamWin.Models;

public sealed class AudioDeviceInfo
{
    public string Id   { get; }
    public string Name { get; }

    public AudioDeviceInfo(string id, string name)
    {
        Id   = id;
        Name = name;
    }

    public override string ToString() => Name;
}
