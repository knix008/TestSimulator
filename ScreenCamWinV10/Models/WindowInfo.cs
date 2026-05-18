namespace ScreenCamWin.Models;

public class WindowInfo
{
    public IntPtr Handle   { get; init; }
    public string Title    { get; init; } = string.Empty;
    public bool   IsDesktop { get; init; }

    public static WindowInfo Desktop { get; } = new()
    {
        Handle    = IntPtr.Zero,
        Title     = "전체 화면 (Desktop)",
        IsDesktop = true,
    };

    public override string ToString() => Title;
}
