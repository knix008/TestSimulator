namespace MyDiffWinV10.App.Controls;

/// <summary>
/// One logical line shown in a diff pane list.
/// </summary>
public sealed class PaneLineItem
{
    public required string Text { get; init; }

    public required Color BackColor { get; init; }

    public override string ToString() => Text;
}
