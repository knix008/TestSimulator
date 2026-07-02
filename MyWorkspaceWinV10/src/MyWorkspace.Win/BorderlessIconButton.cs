using System.ComponentModel;

namespace MyWorkspace.Win;

internal enum WindowChromeGlyph
{
    None,
    Minimize,
    Maximize,
    Restore,
    Close
}

/// <summary>
/// Custom-painted chrome button for the frameless title bar.
/// </summary>
internal sealed class BorderlessIconButton : Button
{
    private const int WmEraseBkgnd = 0x0014;

    private bool _hover;
    private bool _pressed;

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public Color NormalBackColor { get; set; } = SystemColors.Control;

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public WindowChromeGlyph ChromeGlyph { get; set; }

    public BorderlessIconButton()
    {
        FlatStyle = FlatStyle.Flat;
        FlatAppearance.BorderSize = 0;
        TabStop = false;
        UseVisualStyleBackColor = false;
        SetStyle(
            ControlStyles.UserPaint |
            ControlStyles.AllPaintingInWmPaint |
            ControlStyles.OptimizedDoubleBuffer,
            true);
        UpdateStyles();
    }

    protected override bool ShowFocusCues => false;

    protected override void OnMouseEnter(EventArgs e)
    {
        _hover = true;
        Invalidate();
        base.OnMouseEnter(e);
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        _hover = false;
        _pressed = false;
        Invalidate();
        base.OnMouseLeave(e);
    }

    protected override void OnMouseDown(MouseEventArgs mevent)
    {
        if (mevent.Button == MouseButtons.Left)
            _pressed = true;
        Invalidate();
        base.OnMouseDown(mevent);
    }

    protected override void OnMouseUp(MouseEventArgs mevent)
    {
        _pressed = false;
        Invalidate();
        base.OnMouseUp(mevent);
    }

    protected override void OnEnabledChanged(EventArgs e)
    {
        Invalidate();
        base.OnEnabledChanged(e);
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WmEraseBkgnd)
            return;

        base.WndProc(ref m);
    }

    protected override void OnPaint(PaintEventArgs pevent)
    {
        var backColor = ResolveBackColor();
        pevent.Graphics.Clear(backColor);

        if (Image is { } image)
        {
            var x = (Width - image.Width) / 2;
            var y = (Height - image.Height) / 2;
            pevent.Graphics.DrawImage(image, x, y, image.Width, image.Height);
            return;
        }

        if (ChromeGlyph != WindowChromeGlyph.None)
        {
            DrawChromeGlyph(pevent.Graphics, backColor);
            return;
        }

        if (!string.IsNullOrEmpty(Text))
        {
            TextRenderer.DrawText(
                pevent.Graphics,
                Text,
                Font,
                ClientRectangle,
                ResolveForeColor(backColor),
                ToTextFormatFlags(TextAlign) | TextFormatFlags.EndEllipsis);
        }
    }

    private Color ResolveBackColor()
    {
        if (!Enabled)
            return NormalBackColor;

        if (_pressed)
            return FlatAppearance.MouseDownBackColor;

        if (_hover)
            return FlatAppearance.MouseOverBackColor;

        return NormalBackColor;
    }

    private Color ResolveForeColor(Color backColor)
    {
        if (ChromeGlyph == WindowChromeGlyph.Close && (_hover || _pressed))
            return Color.White;

        return ForeColor;
    }

    private void DrawChromeGlyph(Graphics graphics, Color backColor)
    {
        graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        graphics.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;

        var color = ResolveForeColor(backColor);
        using var pen = new Pen(color, 1.25f)
        {
            StartCap = System.Drawing.Drawing2D.LineCap.Round,
            EndCap = System.Drawing.Drawing2D.LineCap.Round
        };

        var cx = Width / 2f;
        var cy = Height / 2f;

        switch (ChromeGlyph)
        {
            case WindowChromeGlyph.Minimize:
                graphics.DrawLine(pen, cx - 5f, cy + 4f, cx + 5f, cy + 4f);
                break;

            case WindowChromeGlyph.Maximize:
                graphics.DrawRectangle(pen, cx - 5f, cy - 5f, 10f, 10f);
                break;

            case WindowChromeGlyph.Restore:
                graphics.DrawRectangle(pen, cx - 2f, cy - 5f, 8f, 8f);
                graphics.DrawLine(pen, cx - 5f, cy - 2f, cx + 3f, cy - 2f);
                graphics.DrawLine(pen, cx + 3f, cy - 2f, cx + 3f, cy + 6f);
                graphics.DrawLine(pen, cx - 5f, cy + 6f, cx + 3f, cy + 6f);
                graphics.DrawLine(pen, cx - 5f, cy - 2f, cx - 5f, cy + 6f);
                break;

            case WindowChromeGlyph.Close:
                graphics.DrawLine(pen, cx - 5f, cy - 5f, cx + 5f, cy + 5f);
                graphics.DrawLine(pen, cx + 5f, cy - 5f, cx - 5f, cy + 5f);
                break;
        }
    }

    private static TextFormatFlags ToTextFormatFlags(ContentAlignment align) =>
        align switch
        {
            ContentAlignment.TopLeft => TextFormatFlags.Top | TextFormatFlags.Left,
            ContentAlignment.TopCenter => TextFormatFlags.Top | TextFormatFlags.HorizontalCenter,
            ContentAlignment.TopRight => TextFormatFlags.Top | TextFormatFlags.Right,
            ContentAlignment.MiddleLeft => TextFormatFlags.VerticalCenter | TextFormatFlags.Left,
            ContentAlignment.MiddleCenter => TextFormatFlags.VerticalCenter | TextFormatFlags.HorizontalCenter,
            ContentAlignment.MiddleRight => TextFormatFlags.VerticalCenter | TextFormatFlags.Right,
            ContentAlignment.BottomLeft => TextFormatFlags.Bottom | TextFormatFlags.Left,
            ContentAlignment.BottomCenter => TextFormatFlags.Bottom | TextFormatFlags.HorizontalCenter,
            ContentAlignment.BottomRight => TextFormatFlags.Bottom | TextFormatFlags.Right,
            _ => TextFormatFlags.VerticalCenter | TextFormatFlags.HorizontalCenter,
        };
}
