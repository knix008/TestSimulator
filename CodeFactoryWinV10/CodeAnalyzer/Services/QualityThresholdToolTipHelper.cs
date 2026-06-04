namespace CodeAnalyzer.Services;

public static class QualityThresholdToolTipHelper
{
    public static ToolTip AttachToGroup(GroupBox group, params (Control Label, Control? Input, string Text)[] rows)
    {
        var toolTip = CreateToolTip();
        toolTip.SetToolTip(group, QualityThresholdToolTipTexts.Group);

        foreach (var (label, input, text) in rows)
        {
            toolTip.SetToolTip(label, text);
            if (input is not null)
            {
                toolTip.SetToolTip(input, text);
            }
        }

        return toolTip;
    }

    public static ToolTip CreateToolTip() => new()
    {
        AutoPopDelay = 16_000,
        InitialDelay = 400,
        ReshowDelay = 200,
        ShowAlways = true,
        IsBalloon = false
    };
}
