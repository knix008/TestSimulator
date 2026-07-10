using System.Diagnostics.CodeAnalysis;

namespace DiffMergeWinV10.App.Controls;

/// <summary>
/// A Button that draws its icon and text at exactly the same vertical center.
/// The base OnPaint handles the flat background/border; a suppression flag makes
/// the Text getter return "" during that call so the base renders no text, then
/// we draw both icon and text ourselves at ClientSize.Height / 2.
/// </summary>
public sealed class IconTextButton : Button
{
    private const int IconGap = 6;
    private const int HorizontalPad = 8;
    private const int VerticalPad = 4;
    private Image? _icon;
    private string _displayText = string.Empty;
    private bool _suppressTextForBasePaint;

    public IconTextButton()
    {
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        UseCompatibleTextRendering = false;
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

    [AllowNull]
    public override string Text
    {
        get => _suppressTextForBasePaint ? string.Empty : _displayText;
        set
        {
            var normalized = value ?? string.Empty;
            if (_displayText == normalized)
            {
                return;
            }

            _displayText = normalized;
            UpdateMetrics();
            Invalidate();
        }
    }

    protected override void OnFontChanged(EventArgs e)
    {
        base.OnFontChanged(e);
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
        _suppressTextForBasePaint = true;
        base.OnPaint(e);
        _suppressTextForBasePaint = false;

        int centerY = ClientSize.Height / 2;

        if (_icon != null)
        {
            e.Graphics.DrawImage(_icon, HorizontalPad, centerY - _icon.Height / 2, _icon.Width, _icon.Height);
        }

        if (!string.IsNullOrEmpty(_displayText))
        {
            int textX = HorizontalPad + (_icon != null ? _icon.Width + IconGap : 0);
            var textRect = new Rectangle(textX, 0, ClientSize.Width - textX - (HorizontalPad + 2), ClientSize.Height);
            var color = Enabled ? ForeColor : SystemColors.GrayText;
            TextRenderer.DrawText(e.Graphics, _displayText, Font, textRect, color,
                TextFormatFlags.SingleLine | TextFormatFlags.NoPadding | TextFormatFlags.VerticalCenter);
        }
    }

    private void UpdateMetrics()
    {
        Padding = Padding.Empty;
        MinimumSize = ComputeMinimumSize();
    }

    private Size ComputeMinimumSize()
    {
        int textHeight = string.IsNullOrEmpty(_displayText)
            ? 0
            : TextRenderer.MeasureText(_displayText, Font, Size.Empty, TextFormatFlags.SingleLine | TextFormatFlags.NoPadding).Height;
        int contentHeight = Math.Max(_icon?.Height ?? 0, textHeight);
        int height = contentHeight + (VerticalPad * 2) + 2;

        int textWidth = string.IsNullOrEmpty(_displayText)
            ? 0
            : TextRenderer.MeasureText(_displayText, Font, Size.Empty, TextFormatFlags.SingleLine | TextFormatFlags.NoPadding).Width;
        int iconTotalWidth = _icon != null ? HorizontalPad + _icon.Width + IconGap : HorizontalPad;
        int width = iconTotalWidth + textWidth + (HorizontalPad + 2) + 4;
        return new Size(width, height);
    }
}
