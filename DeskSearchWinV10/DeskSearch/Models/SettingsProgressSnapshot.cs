namespace DeskSearch.Models;

public sealed class SettingsProgressSnapshot
{
    public int Percent { get; init; }

    public string PhaseText { get; init; } = string.Empty;

    public string StatusText { get; init; } = string.Empty;

    public bool IsIndexing { get; init; }

    public bool IsScanRunning { get; init; }

    public bool IsPostProcessing { get; init; }

    public bool IsSearching { get; init; }

    public bool CanResetIndex { get; init; }
}
