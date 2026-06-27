namespace ImageRembgWinV10.Services;

public enum OutputSizeMode
{
    Original,
    SelectionCrop
}

public sealed class OutputSizeModeOption
{
    public OutputSizeModeOption(OutputSizeMode mode, string displayName)
    {
        Mode = mode;
        DisplayName = displayName;
    }

    public OutputSizeMode Mode { get; }

    public string DisplayName { get; }

    public override string ToString() => DisplayName;
}
