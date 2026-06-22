namespace MyGitWinV10.App.Controls;

/// <summary>
/// Custom menu renderer: readable dropdown icons, open/selected states, and text-only root menu bar.
/// </summary>
internal sealed class MenuStripRootIconRenderer : ToolStripProfessionalRenderer
{
    internal const int MenuBarIconSize = IconFactory.MenuBarIconSize;
    internal const int ContextMenuIconSize = IconFactory.MenuIconSize;
    internal const int IconTextGap = 5;
    internal const int DropDownPaddingLeft = 6;
    internal const int MenuBarDropDownIconColumnWidth = MenuBarIconSize + 8;
    internal const int ContextMenuDropDownIconColumnWidth = ContextMenuIconSize + 8;
    internal const int MenuBarDropDownMinWidth = 200;
    internal const int ContextMenuDropDownMinWidth = 170;

    internal const float RootMenuFontSize = 10.5f;
    internal const float DropDownMenuFontSize = 10.5f;
    internal const int RootMenuHeight = 34;
    internal const int RootMenuIconSize = IconFactory.RootMenuIconSize;
    internal const int RootMenuIconLeft = 7;
    internal const int RootMenuIconTextGap = 6;

    private static readonly Color RootSelectedBackground = Color.FromArgb(219, 234, 254);
    private static readonly Color RootSelectedText = Color.FromArgb(30, 41, 59);
    private static readonly Color RootText = Color.FromArgb(51, 65, 85);

    public MenuStripRootIconRenderer()
        : base(new AppMenuColorTable())
    {
    }

    internal static bool IsMenuBarDropDownItem(ToolStripItem item)
    {
        ToolStrip? owner = item.Owner;
        while (owner is not null)
        {
            if (owner is MenuStrip)
            {
                return true;
            }

            if (owner is ContextMenuStrip)
            {
                return false;
            }

            owner = owner is ToolStripDropDown dropDown
                ? dropDown.OwnerItem?.Owner
                : null;
        }

        return false;
    }

    internal static int GetMinDropDownItemHeight(bool menuBar) =>
        (menuBar ? MenuBarIconSize : ContextMenuIconSize) + 10;

    internal static int GetIconColumnWidth(bool menuBar) =>
        menuBar ? MenuBarDropDownIconColumnWidth : ContextMenuDropDownIconColumnWidth;

    internal static int GetIconSize(bool menuBar) =>
        menuBar ? MenuBarIconSize : ContextMenuIconSize;

    internal static Padding GetDropDownPadding(bool menuBar) =>
        menuBar ? MenuBarDropDownPadding : ContextMenuDropDownPadding;

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
                var highlight = new Rectangle(Point.Empty, e.Item.Size);
                if (e.ToolStrip is ToolStripDropDown dropDown)
                {
                    int rowWidth = dropDown.ClientRectangle.Width - e.Item.Bounds.Left;
                    if (rowWidth > highlight.Width)
                    {
                        highlight.Width = rowWidth;
                    }
                }

                using var brush = new SolidBrush(RootSelectedBackground);
                e.Graphics.FillRectangle(brush, highlight);
            }

            return;
        }

        base.OnRenderMenuItemBackground(e);
    }

    protected override void OnRenderItemImage(ToolStripItemImageRenderEventArgs e)
    {
        // Icons are painted in OnRenderItemText — this handler's clip rect excludes the
        // left padding column where icons are positioned.
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
            var textFormat = (e.TextFormat & ~(TextFormatFlags.VerticalCenter | TextFormatFlags.HidePrefix | TextFormatFlags.NoPrefix))
                | TextFormatFlags.VerticalCenter;

            int textX = e.Item.Padding.Left;
            if (e.Item.Image is not null)
            {
                int iconY = Math.Max(0, (e.Item.Height - RootMenuIconSize) / 2);
                e.Graphics.DrawImage(e.Item.Image, RootMenuIconLeft, iconY, RootMenuIconSize, RootMenuIconSize);
                textX = RootMenuIconLeft + RootMenuIconSize + RootMenuIconTextGap;
            }

            var textRect = new Rectangle(
                textX,
                0,
                Math.Max(0, e.Item.Width - e.Item.Padding.Right - textX),
                e.Item.Height);

            TextRenderer.DrawText(
                e.Graphics,
                e.Text ?? string.Empty,
                e.TextFont!,
                textRect,
                textColor,
                textFormat);
            return;
        }

        if (e.Item is ToolStripMenuItem && e.Item.Owner is not MenuStrip)
        {
            bool menuBar = IsMenuBarDropDownItem(e.Item);
            RenderDropDownText(
                e.Graphics,
                e.Item,
                e.Text ?? string.Empty,
                e.TextFont!,
                RootSelectedText,
                e.TextFormat,
                menuBar);
            return;
        }

        base.OnRenderItemText(e);
    }

    private static void RenderDropDownText(
        Graphics graphics,
        ToolStripItem item,
        string text,
        Font font,
        Color textColor,
        TextFormatFlags format,
        bool menuBar)
    {
        int iconSize = GetIconSize(menuBar);
        int iconColumnWidth = GetIconColumnWidth(menuBar);

        if (item.Image is not null)
        {
            int iconX = DropDownPaddingLeft + Math.Max(0, (iconColumnWidth - iconSize) / 2);
            int iconY = Math.Max(0, (item.Height - iconSize) / 2);
            graphics.DrawImage(item.Image, iconX, iconY, iconSize, iconSize);
        }

        int textX = DropDownPaddingLeft + iconColumnWidth + IconTextGap;
        var textRect = new Rectangle(
            textX,
            0,
            Math.Max(0, item.Width - item.Padding.Right - textX),
            item.Height);

        var textFormat = (format & ~(TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis | TextFormatFlags.HidePrefix | TextFormatFlags.NoPrefix))
            | TextFormatFlags.VerticalCenter;

        int tabIndex = text.IndexOf('\t');
        if (tabIndex < 0)
        {
            TextRenderer.DrawText(graphics, text, font, textRect, textColor, textFormat);
            return;
        }

        string label = text[..tabIndex];
        string shortcut = text[(tabIndex + 1)..];
        var shortcutFormat = (textFormat & ~TextFormatFlags.Left) | TextFormatFlags.Right;
        Size shortcutSize = TextRenderer.MeasureText(graphics, shortcut, font, textRect.Size, shortcutFormat);

        var labelRect = new Rectangle(textRect.X, textRect.Y, Math.Max(0, textRect.Width - shortcutSize.Width), textRect.Height);
        TextRenderer.DrawText(graphics, label, font, labelRect, textColor, textFormat | TextFormatFlags.EndEllipsis);
        TextRenderer.DrawText(graphics, shortcut, font, textRect, textColor, shortcutFormat);
    }

    internal static Padding MenuBarDropDownPadding =>
        new(DropDownPaddingLeft + MenuBarDropDownIconColumnWidth + IconTextGap, 5, 10, 5);

    internal static Padding ContextMenuDropDownPadding =>
        new(DropDownPaddingLeft + ContextMenuDropDownIconColumnWidth + IconTextGap, 4, 8, 4);

    internal static Padding RootMenuPadding =>
        new(RootMenuIconLeft + RootMenuIconSize + RootMenuIconTextGap, 2, 7, 2);

    protected override void OnRenderImageMargin(ToolStripRenderEventArgs e)
    {
        // Image margin disabled (ShowImageMargin = false); skip default margin painting.
    }

    protected override void OnRenderToolStripBackground(ToolStripRenderEventArgs e)
    {
        if (e.ToolStrip is MenuStrip)
        {
            base.OnRenderToolStripBackground(e);
            return;
        }

        e.Graphics.Clear(Color.White);
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
