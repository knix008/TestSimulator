namespace MyWorkspace.Win;

internal sealed class ThemedDialogButton : Button
{
    private const int WmEraseBkgnd = 0x0014;
    private const int IconTextGap = 6;

    private bool _hover;
    private bool _pressed;

    public ThemedDialogButton()
    {
        FlatStyle = FlatStyle.Flat;
        UseVisualStyleBackColor = false;
        SetStyle(
            ControlStyles.UserPaint |
            ControlStyles.AllPaintingInWmPaint |
            ControlStyles.OptimizedDoubleBuffer |
            ControlStyles.ResizeRedraw,
            true);
        UpdateStyles();
    }

    protected override bool ShowFocusCues => false;

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WmEraseBkgnd)
            return;

        base.WndProc(ref m);
    }

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

    protected override void OnTextChanged(EventArgs e)
    {
        Invalidate();
        base.OnTextChanged(e);
    }

    protected override void OnFontChanged(EventArgs e)
    {
        Invalidate();
        base.OnFontChanged(e);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var graphics = e.Graphics;
        var backColor = ResolveBackColor();
        var foreColor = Enabled ? ForeColor : SystemColors.GrayText;

        using (var brush = new SolidBrush(backColor))
            graphics.FillRectangle(brush, ClientRectangle);

        if (FlatAppearance.BorderSize > 0)
        {
            using var pen = new Pen(FlatAppearance.BorderColor, FlatAppearance.BorderSize);
            var borderRect = ClientRectangle;
            borderRect.Width -= 1;
            borderRect.Height -= 1;
            graphics.DrawRectangle(pen, borderRect);
        }

        if (Image != null && !string.IsNullOrEmpty(Text))
        {
            PaintIconAndText(graphics, foreColor);
            return;
        }

        if (Image != null)
        {
            var iconX = (Width - Image.Width) / 2;
            var iconY = (Height - Image.Height) / 2;
            graphics.DrawImage(Image, iconX, iconY, Image.Width, Image.Height);
            return;
        }

        if (string.IsNullOrEmpty(Text))
            return;

        TextRenderer.DrawText(
            graphics,
            Text,
            Font,
            ClientRectangle,
            foreColor,
            TextFormatFlags.HorizontalCenter
            | TextFormatFlags.VerticalCenter
            | TextFormatFlags.SingleLine
            | TextFormatFlags.NoPadding);
    }

    private void PaintIconAndText(Graphics graphics, Color foreColor)
    {
        const TextFormatFlags flags = TextFormatFlags.SingleLine | TextFormatFlags.NoPadding;

        var textSize = TextRenderer.MeasureText(
            Text,
            Font,
            new Size(int.MaxValue, int.MaxValue),
            flags);
        var icon = Image!;
        var contentWidth = icon.Width + IconTextGap + textSize.Width;
        var contentHeight = Math.Max(icon.Height, textSize.Height);
        var startX = (Width - contentWidth) / 2;
        var startY = (Height - contentHeight) / 2;

        graphics.DrawImage(
            icon,
            startX,
            startY + (contentHeight - icon.Height) / 2,
            icon.Width,
            icon.Height);

        var textX = startX + icon.Width + IconTextGap;
        var textY = startY + (contentHeight - textSize.Height) / 2;
        TextRenderer.DrawText(
            graphics,
            Text,
            Font,
            new Rectangle(textX, textY, textSize.Width + 2, textSize.Height),
            foreColor,
            flags);
    }

    private Color ResolveBackColor()
    {
        if (!Enabled)
            return BackColor;

        if (_pressed)
            return FlatAppearance.MouseDownBackColor;

        if (_hover)
            return FlatAppearance.MouseOverBackColor;

        return BackColor;
    }
}
