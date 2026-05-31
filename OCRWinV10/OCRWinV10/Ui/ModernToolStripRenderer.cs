namespace OCRWinV10.Ui;

public sealed class ModernToolStripRenderer : ToolStripProfessionalRenderer
{
    public ModernToolStripRenderer() : base(new ModernColorTable()) { }

    protected override void OnRenderButtonBackground(ToolStripItemRenderEventArgs e)
    {
        if (e.Item is ToolStripButton ocrBtn && ocrBtn.Name == "tsbOcr")
        {
            PaintOcrButtonBackground(e.Graphics, ocrBtn, e.Item.Size);
            return;
        }

        var btn = e.Item as ToolStripButton;
        if (btn is { Enabled: true } && (btn.Pressed || btn.Checked || btn.Selected))
        {
            var rect = new Rectangle(Point.Empty, e.Item.Size);
            using var brush = new SolidBrush(Color.FromArgb(219, 234, 254));
            e.Graphics.FillRectangle(brush, rect);
            return;
        }

        base.OnRenderButtonBackground(e);
    }

    protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
    {
        if (e.Item is ToolStripButton { Name: "tsbOcr" } ocrBtn)
            e.TextColor = ocrBtn.Enabled
                ? UiTheme.PrimaryActionText
                : UiTheme.PrimaryActionTextDisabled;

        base.OnRenderItemText(e);
    }

    private static void PaintOcrButtonBackground(Graphics g, ToolStripButton btn, Size size)
    {
        var rect = new Rectangle(1, 1, size.Width - 2, size.Height - 2);
        Color bg = !btn.Enabled
            ? UiTheme.PrimaryActionDisabled
            : btn.Pressed
                ? UiTheme.PrimaryActionPressed
                : btn.Selected
                    ? UiTheme.PrimaryActionHover
                    : UiTheme.PrimaryAction;

        using var brush = new SolidBrush(bg);
        g.FillRectangle(brush, rect);
    }

    private sealed class ModernColorTable : ProfessionalColorTable
    {
        public override Color ToolStripGradientBegin => UiTheme.ToolStripBackground;
        public override Color ToolStripGradientMiddle => UiTheme.ToolStripBackground;
        public override Color ToolStripGradientEnd => UiTheme.ToolStripBackground;
        public override Color MenuStripGradientBegin => UiTheme.Surface;
        public override Color MenuStripGradientEnd => UiTheme.Surface;
        public override Color StatusStripGradientBegin => UiTheme.StatusBackground;
        public override Color StatusStripGradientEnd => UiTheme.StatusBackground;
        public override Color SeparatorDark => UiTheme.Border;
        public override Color SeparatorLight => UiTheme.Border;
        public override Color GripDark => UiTheme.Border;
        public override Color GripLight => UiTheme.Surface;
    }
}
