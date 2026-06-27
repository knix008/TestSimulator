namespace DiffMergeWinV10.App.Controls;

/// <summary>
/// A flat, light-themed color table for the app's MenuStrip/ToolStrip — replaces the
/// default beige Windows 9x-era gradient with a modern white/blue palette.
/// </summary>
public sealed class ModernToolStripRenderer : ToolStripProfessionalRenderer
{
    public ModernToolStripRenderer() : base(new ModernColorTable())
    {
    }

    protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e)
    {
        using var pen = new Pen(Color.FromArgb(226, 232, 240));
        e.Graphics.DrawLine(pen, 0, e.ToolStrip.Height - 1, e.ToolStrip.Width, e.ToolStrip.Height - 1);
    }

    private sealed class ModernColorTable : ProfessionalColorTable
    {
        public override Color ToolStripGradientBegin => Color.White;
        public override Color ToolStripGradientMiddle => Color.White;
        public override Color ToolStripGradientEnd => Color.White;
        public override Color MenuStripGradientBegin => Color.White;
        public override Color MenuStripGradientEnd => Color.White;
        public override Color ImageMarginGradientBegin => Color.White;
        public override Color ImageMarginGradientMiddle => Color.White;
        public override Color ImageMarginGradientEnd => Color.White;
        public override Color MenuItemSelected => Color.FromArgb(219, 234, 254);
        public override Color MenuItemSelectedGradientBegin => Color.FromArgb(219, 234, 254);
        public override Color MenuItemSelectedGradientEnd => Color.FromArgb(219, 234, 254);
        public override Color MenuItemPressedGradientBegin => Color.FromArgb(191, 219, 254);
        public override Color MenuItemPressedGradientEnd => Color.FromArgb(191, 219, 254);
        public override Color MenuItemBorder => Color.FromArgb(96, 165, 250);
        public override Color ButtonSelectedHighlight => Color.FromArgb(219, 234, 254);
        public override Color ButtonSelectedHighlightBorder => Color.FromArgb(96, 165, 250);
        public override Color ButtonPressedHighlight => Color.FromArgb(191, 219, 254);
        public override Color ButtonPressedHighlightBorder => Color.FromArgb(59, 130, 246);
        public override Color SeparatorDark => Color.FromArgb(226, 232, 240);
        public override Color SeparatorLight => Color.White;
    }
}
