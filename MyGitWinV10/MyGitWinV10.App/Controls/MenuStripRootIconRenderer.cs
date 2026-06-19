namespace MyGitWinV10.App.Controls;

/// <summary>
/// Custom menu renderer: root bar icons, visible open/selected states, and readable dropdown colors.
/// </summary>
internal sealed class MenuStripRootIconRenderer : ToolStripProfessionalRenderer
{
    internal const int IconSize = 16;
    internal const int IconTextGap = 6;
    internal const int IconMargin = 4;
    internal const int DropDownPaddingLeft = 8;
    internal const int DropDownIconColumnWidth = 28;

    internal const float RootMenuFontSize = 10.5f;
    internal const float DropDownMenuFontSize = 10.5f;
    internal const int RootMenuHeight = 34;

    private static readonly Color RootSelectedBackground = Color.FromArgb(219, 234, 254);
    private static readonly Color RootSelectedText = Color.FromArgb(30, 41, 59);
    private static readonly Color RootText = Color.FromArgb(51, 65, 85);

    public MenuStripRootIconRenderer()
        : base(new AppMenuColorTable())
    {
    }

    protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e)
    {
        if (e.Item.Owner is MenuStrip && (e.Item.Selected || e.Item.Pressed))
        {
            using var brush = new SolidBrush(RootSelectedBackground);
            e.Graphics.FillRectangle(brush, new Rectangle(Point.Empty, e.Item.Size));
            return;
        }

        if (e.Item is ToolStripMenuItem && e.Item.Owner is not MenuStrip)
        {
            if (e.Item.Selected)
            {
                using var brush = new SolidBrush(RootSelectedBackground);
                e.Graphics.FillRectangle(brush, new Rectangle(Point.Empty, e.Item.Size));
            }

            return;
        }

        base.OnRenderMenuItemBackground(e);
    }

    protected override void OnRenderItemImage(ToolStripItemImageRenderEventArgs e)
    {
        if (e.Item is ToolStripMenuItem { Image: not null })
        {
            return;
        }

        base.OnRenderItemImage(e);
    }

    protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
    {
        if (e.Item.Owner is MenuStrip)
        {
            var textColor = e.Item.Selected || e.Item.Pressed ? RootSelectedText : RootText;
            RenderIconAndText(
                e.Graphics,
                e.Item,
                e.Text ?? string.Empty,
                e.TextFont!,
                textColor,
                e.TextFormat,
                IconMargin);
            return;
        }

        if (e.Item is ToolStripMenuItem && e.Item.Owner is not MenuStrip)
        {
            RenderIconAndText(
                e.Graphics,
                e.Item,
                e.Text ?? string.Empty,
                e.TextFont!,
                RootSelectedText,
                e.TextFormat,
                DropDownPaddingLeft,
                DropDownIconColumnWidth);
            return;
        }

        base.OnRenderItemText(e);
    }

    private static void RenderIconAndText(
        Graphics graphics,
        ToolStripItem item,
        string text,
        Font font,
        Color textColor,
        TextFormatFlags format,
        int iconLeft,
        int iconColumnWidth = IconSize)
    {
        // Item paint uses coordinates relative to the item (0,0 = top-left of item).
        int iconX = iconLeft + Math.Max(0, (iconColumnWidth - IconSize) / 2);
        int rowTop = item.ContentRectangle.Top;
        int rowHeight = item.ContentRectangle.Height;
        int iconY = rowTop + (rowHeight - IconSize) / 2;

        if (item.Image is not null)
        {
            graphics.DrawImage(item.Image, iconX, iconY, IconSize, IconSize);
        }

        int textX = item.Image is not null
            ? iconLeft + iconColumnWidth + IconTextGap
            : iconLeft;
        var textRect = new Rectangle(
            textX,
            rowTop,
            Math.Max(0, item.Width - item.Padding.Right - textX),
            rowHeight);

        var textFormat = (format & ~TextFormatFlags.VerticalCenter) | TextFormatFlags.VerticalCenter;
        TextRenderer.DrawText(graphics, text, font, textRect, textColor, textFormat);
    }

    internal static Padding DropDownMenuPadding =>
        new(DropDownPaddingLeft + DropDownIconColumnWidth + IconTextGap, 3, 8, 3);

    internal static Padding RootMenuPadding =>
        new(IconMargin + IconSize + IconTextGap, 2, 6, 2);

    protected override void OnRenderImageMargin(ToolStripRenderEventArgs e)
    {
        if (e.ToolStrip is MenuStrip)
        {
            base.OnRenderImageMargin(e);
        }
    }

    private sealed class AppMenuColorTable : ProfessionalColorTable
    {
        public override Color ToolStripDropDownBackground => Color.White;

        public override Color ImageMarginGradientBegin => Color.FromArgb(248, 249, 251);

        public override Color ImageMarginGradientMiddle => ImageMarginGradientBegin;

        public override Color ImageMarginGradientEnd => ImageMarginGradientBegin;

        public override Color MenuBorder => Color.FromArgb(203, 213, 225);

        public override Color MenuItemBorder => Color.Transparent;

        public override Color MenuItemSelected => Color.FromArgb(219, 234, 254);

        public override Color MenuItemSelectedGradientBegin => MenuItemSelected;

        public override Color MenuItemSelectedGradientEnd => MenuItemSelected;

        public override Color MenuItemPressedGradientBegin => Color.FromArgb(191, 219, 254);

        public override Color MenuItemPressedGradientEnd => MenuItemPressedGradientBegin;
    }
}
