namespace MyProject.Theme
{
    public static class AppChrome
    {
        public static void ApplyMenuStrip(MenuStrip menuStrip)
        {
            menuStrip.Font = AppTheme.FontMenu;
            menuStrip.ImageScalingSize = AppTheme.MenuImageSize;
            menuStrip.Padding = new Padding(6, 2, 0, 2);
            EnableAutoSize(menuStrip.Items);
        }

        public static void ApplyToolStrip(ToolStrip toolStrip)
        {
            toolStrip.Font = AppTheme.FontToolbar;
            toolStrip.ImageScalingSize = AppTheme.ToolbarImageSize;
            toolStrip.AutoSize = false;
            toolStrip.Height = AppTheme.ToolbarHeight;
            toolStrip.Padding = AppTheme.ToolbarStripPadding;

            int itemHeight = AppTheme.ToolbarHeight - toolStrip.Padding.Vertical;
            foreach (ToolStripItem item in toolStrip.Items)
            {
                item.AutoSize = false;
                if (item is ToolStripSeparator)
                {
                    item.Margin = AppTheme.ToolbarSeparatorMargin;
                    item.Size = new Size(8, itemHeight);
                    continue;
                }

                if (item is ToolStripButton btn)
                {
                    btn.Margin = AppTheme.ToolbarItemMargin;
                    btn.ImageAlign = ContentAlignment.MiddleCenter;
                    btn.TextAlign = ContentAlignment.MiddleCenter;
                    int width = btn.DisplayStyle == ToolStripItemDisplayStyle.ImageAndText
                        ? Math.Max(72, btn.GetPreferredSize(Size.Empty).Width + 6)
                        : AppTheme.ToolbarButtonWidth;
                    btn.Size = new Size(width, itemHeight);
                    continue;
                }

                if (item is ToolStripControlHost host)
                {
                    host.Margin = AppTheme.ToolbarSeparatorMargin;
                    host.Size = new Size(AppTheme.ToolbarControlHostWidth, itemHeight);
                    host.BackColor = AppTheme.ToolbarBackground;
                    host.Control.Margin = Padding.Empty;
                    host.Control.BackColor = AppTheme.ToolbarBackground;
                    host.Control.Size = new Size(AppTheme.ToolbarControlHostWidth, itemHeight);
                }
            }
        }

        public static void ApplyContextMenu(ContextMenuStrip menu)
        {
            menu.Font = AppTheme.FontMenu;
            menu.ImageScalingSize = AppTheme.MenuImageSize;
            EnableAutoSize(menu.Items);
        }

        private static void EnableAutoSize(ToolStripItemCollection items)
        {
            foreach (ToolStripItem item in items)
            {
                item.AutoSize = true;
                if (item is ToolStripMenuItem menuItem)
                    EnableAutoSize(menuItem.DropDownItems);
            }
        }
    }
}
