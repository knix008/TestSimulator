namespace MyDiffWinV10.App.Controls;

/// <summary>
/// One logical line shown in a diff pane list.
/// </summary>
public sealed class PaneLineItem
{
    public required string Text { get; init; }

    public required Color BackColor { get; init; }

    /// <summary>
    /// When set, the line uses the fast fixed-width binary hex renderer; bits mark differing bytes.
    /// </summary>
    public ushort? BinaryByteDiffMask { get; init; }

    public override string ToString() => Text;
}
