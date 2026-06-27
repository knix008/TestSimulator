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
    private Image? _icon;

    public Image? Icon
    {
        get => _icon;
        set
        {
            _icon = value;
            Padding = new Padding(value != null ? value.Width + IconGap : 8, 4, 8, 4);
            Invalidate();
        }
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        if (_icon == null)
        {
            return;
        }

        int y = (ClientSize.Height - _icon.Height) / 2;
        e.Graphics.DrawImage(_icon, 8, y, _icon.Width, _icon.Height);
    }
}
