namespace EasyMDV10;

internal sealed class ModernToolStripRenderer : ToolStripProfessionalRenderer
{
    public ModernToolStripRenderer()
        : base(new ModernColorTable())
    {
        RoundedEdges = false;
    }

    protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e)
    {
        if (e.ToolStrip is MenuStrip)
            return;

        using var pen = new Pen(UiTheme.Border);
        var bounds = e.AffectedBounds;
        e.Graphics.DrawLine(pen, bounds.Left, bounds.Bottom - 1, bounds.Right, bounds.Bottom - 1);
    }

    protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e)
    {
        if (!e.Item.Selected && !e.Item.Pressed)
            return;

        var rect = new Rectangle(Point.Empty, e.Item.Size);
        rect.Inflate(-2, -1);
        var color = e.Item.Pressed ? UiTheme.ToolbarPressed : UiTheme.ToolbarHover;
        using var brush = new SolidBrush(color);
        e.Graphics.FillRectangle(brush, rect);
    }

    protected override void OnRenderButtonBackground(ToolStripItemRenderEventArgs e)
    {
        if (!e.Item.Selected && !e.Item.Pressed)
            return;

        var rect = new Rectangle(Point.Empty, e.Item.Size);
        rect.Inflate(-3, -3);
        var color = e.Item.Pressed ? UiTheme.ToolbarPressed : UiTheme.ToolbarHover;
        using var brush = new SolidBrush(color);
        e.Graphics.FillRectangle(brush, rect);
    }

    protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
    {
        e.TextColor = UiTheme.TextPrimary;
        base.OnRenderItemText(e);
    }

    protected override void OnRenderSeparator(ToolStripSeparatorRenderEventArgs e)
    {
        var rect = e.Item.ContentRectangle;
        int x = rect.Left + rect.Width / 2;
        using var pen = new Pen(UiTheme.Border);
        e.Graphics.DrawLine(pen, x, rect.Top + 4, x, rect.Bottom - 4);
    }
}

internal sealed class ModernColorTable : ProfessionalColorTable
{
    public override Color ToolStripGradientBegin => UiTheme.ToolbarBackground;
    public override Color ToolStripGradientMiddle => UiTheme.ToolbarBackground;
    public override Color ToolStripGradientEnd => UiTheme.ToolbarBackground;
    public override Color MenuStripGradientBegin => UiTheme.ToolbarBackground;
    public override Color MenuStripGradientEnd => UiTheme.ToolbarBackground;
    public override Color MenuItemSelected => UiTheme.ToolbarHover;
    public override Color MenuItemSelectedGradientBegin => UiTheme.ToolbarHover;
    public override Color MenuItemSelectedGradientEnd => UiTheme.ToolbarHover;
    public override Color MenuItemPressedGradientBegin => UiTheme.ToolbarPressed;
    public override Color MenuItemPressedGradientEnd => UiTheme.ToolbarPressed;
    public override Color MenuItemBorder => UiTheme.Border;
    public override Color MenuBorder => UiTheme.Border;
    public override Color SeparatorDark => UiTheme.Border;
    public override Color SeparatorLight => UiTheme.Border;
    public override Color ToolStripDropDownBackground => UiTheme.Surface;
    public override Color ImageMarginGradientBegin => UiTheme.Surface;
    public override Color ImageMarginGradientMiddle => UiTheme.Surface;
    public override Color ImageMarginGradientEnd => UiTheme.Surface;
}
