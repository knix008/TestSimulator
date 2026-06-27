namespace DiffMergeWinV10.App.Controls;

/// <summary>
/// A Button that paints its icon itself instead of relying on Button.Image —
/// ButtonBase's built-in image+text layout centers each independently and the two
/// end up a few pixels off from each other, so this draws the icon using the same
/// vertical-center formula as the text to guarantee they line up.
/// </summary>
public sealed class IconTextButton : Button
{
    private const int IconGap = 6;
    private const int HorizontalPad = 8;
    private const int VerticalPad = 6;
    private Image? _icon;

    public IconTextButton()
    {
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        UseCompatibleTextRendering = false;
        TextAlign = ContentAlignment.MiddleLeft;
    }

    public Image? Icon
    {
        get => _icon;
        set
        {
            _icon = value;
            UpdateMetrics();
            Invalidate();
        }
    }

    protected override void OnFontChanged(EventArgs e)
    {
        base.OnFontChanged(e);
        UpdateMetrics();
    }

    protected override void OnTextChanged(EventArgs e)
    {
        base.OnTextChanged(e);
        UpdateMetrics();
    }

    public override Size GetPreferredSize(Size proposedSize)
    {
        var size = base.GetPreferredSize(proposedSize);
        var minimum = ComputeMinimumSize();
        return new Size(Math.Max(size.Width, minimum.Width), Math.Max(size.Height, minimum.Height));
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        if (_icon == null)
        {
            return;
        }

        int y = (ClientSize.Height - _icon.Height) / 2;
        e.Graphics.DrawImage(_icon, HorizontalPad, y, _icon.Width, _icon.Height);
    }

    private void UpdateMetrics()
    {
        Padding = new Padding(
            _icon != null ? _icon.Width + IconGap : HorizontalPad,
            VerticalPad,
            HorizontalPad + 2,
            VerticalPad);
        MinimumSize = ComputeMinimumSize();
    }

    private Size ComputeMinimumSize()
    {
        int textHeight = string.IsNullOrEmpty(Text)
            ? 0
            : TextRenderer.MeasureText(Text, Font, Size.Empty, TextFormatFlags.SingleLine | TextFormatFlags.NoPadding).Height;
        int contentHeight = Math.Max(_icon?.Height ?? 0, textHeight);
        int height = contentHeight + (VerticalPad * 2) + 2;

        int textWidth = string.IsNullOrEmpty(Text)
            ? 0
            : TextRenderer.MeasureText(Text, Font, Size.Empty, TextFormatFlags.SingleLine | TextFormatFlags.NoPadding).Width;
        int width = (_icon != null ? _icon.Width + IconGap : 0) + textWidth + (HorizontalPad * 2) + 4;
        return new Size(width, height);
    }
}
