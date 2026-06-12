namespace SVGEditorWinV10.Ui;

/// <summary>
/// A labeled enum option for ComboBox items.
/// </summary>
internal sealed record ComboOption<T>(string Label, T Value) where T : struct, Enum
{
    public override string ToString() => Label;
}
