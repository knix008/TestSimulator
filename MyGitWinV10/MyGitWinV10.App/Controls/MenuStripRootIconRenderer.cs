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
    internal const int MenuBarDropDownIconColumnWidth = 28;
    internal const int ContextMenuDropDownIconColumnWidth = 24;
    internal const int MenuBarDropDownMinWidth = 200;
    internal const int ContextMenuDropDownMinWidth = 170;

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
                // Some dropdown items end up narrower than their siblings (e.g. a short label
                // next to a long one in the same flattened menu), so filling just e.Item.Size
                // leaves the rest of that row unhighlighted. Fill the owning ToolStrip's full
                // width instead so the selection always spans the entire row.
                int rowWidth = e.Item.Owner?.Width ?? e.Item.Width;
                using var brush = new SolidBrush(RootSelectedBackground);
                e.Graphics.FillRectangle(brush, new Rectangle(0, 0, rowWidth, e.Item.Height));
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

            // Always draw the mnemonic ("&File" -> underlined F) instead of only on Alt —
            // HidePrefix/NoPrefix would otherwise hide or strip the accelerator underline.
            var textFormat = (e.TextFormat & ~(TextFormatFlags.VerticalCenter | TextFormatFlags.HidePrefix | TextFormatFlags.NoPrefix))
                | TextFormatFlags.VerticalCenter;

            TextRenderer.DrawText(
                e.Graphics,
                e.Text ?? string.Empty,
                e.TextFont!,
                e.Item.ContentRectangle,
                textColor,
                textFormat);
            return;
        }

        if (e.Item is ToolStripMenuItem && e.Item.Owner is not MenuStrip)
        {
            bool menuBar = IsMenuBarDropDownItem(e.Item);
            RenderIconAndText(
                e.Graphics,
                e.Item,
                e.Text ?? string.Empty,
                e.TextFont!,
                RootSelectedText,
                e.TextFormat,
                DropDownPaddingLeft,
                menuBar ? MenuBarIconSize : ContextMenuIconSize,
                menuBar ? MenuBarDropDownIconColumnWidth : ContextMenuDropDownIconColumnWidth);
            return;
        }

        base.OnRenderItemText(e);
    }

    private static bool IsMenuBarDropDownItem(ToolStripItem item)
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

    private static void RenderIconAndText(
        Graphics graphics,
        ToolStripItem item,
        string text,
        Font font,
        Color textColor,
        TextFormatFlags format,
        int iconLeft,
        int iconSize,
        int iconColumnWidth)
    {
        int iconX = iconLeft + Math.Max(0, (iconColumnWidth - iconSize) / 2);
        int rowTop = item.ContentRectangle.Top;
        int rowHeight = item.ContentRectangle.Height;
        int iconY = rowTop + (rowHeight - iconSize) / 2;

        if (item.Image is not null)
        {
            graphics.DrawImage(item.Image, iconX, iconY, iconSize, iconSize);
        }

        int textX = item.Image is not null
            ? iconLeft + iconColumnWidth + IconTextGap
            : iconLeft;
        var textRect = new Rectangle(
            textX,
            rowTop,
            Math.Max(0, item.Width - item.Padding.Right - textX),
            rowHeight);

        // Render the "&" mnemonic as an underline (e.g. "&Open..." -> "Open...") instead of
        // a literal ampersand — NoPrefix/HidePrefix would otherwise hide or strip it.
        var textFormat = (format & ~(TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis | TextFormatFlags.HidePrefix | TextFormatFlags.NoPrefix))
            | TextFormatFlags.VerticalCenter;

        // The framework embeds a tab-stop position in the incoming format tuned to the
        // *default* (wider) item padding. Once we shrink padding/icon columns, that stale
        // tab stop pushes the shortcut text (after the '\t') past our narrower rect, clipping
        // it — so split the label and shortcut ourselves and right-align the shortcut within
        // the actual available width instead of relying on the tab character.
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
        new(DropDownPaddingLeft + MenuBarDropDownIconColumnWidth + IconTextGap, 4, 10, 4);

    internal static Padding ContextMenuDropDownPadding =>
        new(DropDownPaddingLeft + ContextMenuDropDownIconColumnWidth + IconTextGap, 3, 8, 3);

    internal static Padding RootMenuPadding => new(7, 2, 7, 2);

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
