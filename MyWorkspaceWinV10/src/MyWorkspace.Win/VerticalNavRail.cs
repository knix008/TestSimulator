namespace MyWorkspace.Win;

internal sealed class VerticalNavRail : Panel
{
    public event EventHandler? MenuPopupOpening;
    public event EventHandler? MenuPopupClosed;

    private sealed class NavEntry
    {
        public required Button Button { get; init; }
        public required ToolStripMenuItem MenuRoot { get; init; }
        public required string IconName { get; init; }
        public required string TooltipKey { get; init; }
    }

    private sealed class BottomActionEntry
    {
        public required Button Button { get; init; }
        public required ToolStripMenuItem MenuItem { get; init; }
        public required string IconName { get; init; }
        public required string TooltipKey { get; init; }
    }

    private readonly List<NavEntry> _entries = [];
    private BottomActionEntry? _bottomAction;
    private readonly ToolTip _toolTip = new();

    public VerticalNavRail()
    {
        Name = "navRail";
        Width = 52;
        MinimumSize = new Size(52, 0);
        Dock = DockStyle.Left;
        Padding = new Padding(0, 8, 0, 8);
        TabStop = false;
        if (!DesignMode)
            AppTheme.Changed += OnThemeChanged;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            AppTheme.Changed -= OnThemeChanged;
            _toolTip.Dispose();
            foreach (var entry in _entries)
                entry.Button.Image?.Dispose();
            _bottomAction?.Button.Image?.Dispose();
        }

        base.Dispose(disposing);
    }

    public void AddMenu(ToolStripMenuItem menuRoot, string iconName, string tooltipKey)
    {
        var button = new Button
        {
            Size = new Size(44, 44),
            TabStop = false,
            Tag = menuRoot,
            AccessibleName = tooltipKey,
            UseVisualStyleBackColor = false
        };

        button.Click += OnButtonClick;
        SetButtonIcon(button, IconAssets.Load(24, iconName));
        AppTheme.StyleNavRailButton(button);
        _toolTip.SetToolTip(button, Localization.Get(tooltipKey));

        _entries.Add(new NavEntry
        {
            Button = button,
            MenuRoot = menuRoot,
            IconName = iconName,
            TooltipKey = tooltipKey
        });
        Controls.Add(button);
        Relayout();
    }

    public void SetEntryVisible(ToolStripMenuItem menuRoot, bool visible)
    {
        var entry = _entries.FirstOrDefault(e => ReferenceEquals(e.MenuRoot, menuRoot));
        if (entry == null)
            return;

        entry.Button.Visible = visible;
        Relayout();
    }

    public void AddBottomAction(ToolStripMenuItem menuItem, string iconName, string tooltipKey)
    {
        if (_bottomAction != null)
        {
            _bottomAction.Button.Click -= OnBottomActionClick;
            _bottomAction.Button.Image?.Dispose();
            Controls.Remove(_bottomAction.Button);
            _bottomAction.Button.Dispose();
        }

        var button = new Button
        {
            Size = new Size(44, 44),
            TabStop = false,
            Tag = menuItem,
            AccessibleName = tooltipKey,
            UseVisualStyleBackColor = false
        };

        button.Click += OnBottomActionClick;
        SetButtonIcon(button, IconAssets.Load(24, iconName));
        AppTheme.StyleNavRailButton(button);
        _toolTip.SetToolTip(button, Localization.Get(tooltipKey));

        _bottomAction = new BottomActionEntry
        {
            Button = button,
            MenuItem = menuItem,
            IconName = iconName,
            TooltipKey = tooltipKey
        };

        Controls.Add(button);
        Relayout();
    }

    public void SetBottomActionVisible(ToolStripMenuItem menuItem, bool visible)
    {
        if (_bottomAction == null || !ReferenceEquals(_bottomAction.MenuItem, menuItem))
            return;

        _bottomAction.Button.Visible = visible;
        Relayout();
    }

    public void RefreshIcons()
    {
        foreach (var entry in _entries)
            SetButtonIcon(entry.Button, IconAssets.Load(24, entry.IconName));

        if (_bottomAction != null)
            SetButtonIcon(_bottomAction.Button, IconAssets.Load(24, _bottomAction.IconName));
    }

    public void RefreshTheme()
    {
        BackColor = AppTheme.Sidebar;
        AppTheme.StyleBorderedPanel(this, PanelEdges.Right);
        AppTheme.StyleToolTip(_toolTip);
        foreach (var entry in _entries)
            AppTheme.StyleNavRailButton(entry.Button);
        if (_bottomAction != null)
            AppTheme.StyleNavRailButton(_bottomAction.Button);
    }

    public void RefreshTooltips()
    {
        foreach (var entry in _entries)
            _toolTip.SetToolTip(entry.Button, Localization.Get(entry.TooltipKey));
        if (_bottomAction != null)
            _toolTip.SetToolTip(_bottomAction.Button, Localization.Get(_bottomAction.TooltipKey));
    }

    private void OnButtonClick(object? sender, EventArgs e)
    {
        if (sender is not Button button || button.Tag is not ToolStripMenuItem menuRoot)
            return;

        if (!menuRoot.Enabled || !button.Visible || !menuRoot.HasDropDownItems)
            return;

        if (TryActivateSingleLeafMenu(menuRoot))
            return;

        BeginInvoke(() =>
        {
            if (!button.Visible || !menuRoot.Enabled)
                return;

            ShowMenuAtButton(menuRoot, button);
        });
    }

    private static bool TryActivateSingleLeafMenu(ToolStripMenuItem menuRoot)
    {
        ToolStripMenuItem? singleLeaf = null;
        var leafCount = 0;

        foreach (ToolStripItem item in menuRoot.DropDownItems)
        {
            if (item is ToolStripSeparator)
                continue;

            if (item is not ToolStripMenuItem menuItem)
                return false;

            if (menuItem.HasDropDownItems)
                return false;

            singleLeaf = menuItem;
            leafCount++;
            if (leafCount > 1)
                return false;
        }

        if (singleLeaf == null)
            return false;

        MenuItemClickForwarder.Invoke(singleLeaf);
        return true;
    }

    private static void OnBottomActionClick(object? sender, EventArgs e)
    {
        if (sender is not Button button || button.Tag is not ToolStripMenuItem menuItem)
            return;

        if (menuItem.Enabled)
            MenuItemClickForwarder.Invoke(menuItem);
    }

    private void ShowMenuAtButton(ToolStripMenuItem menuRoot, Button button)
    {
        var popupMenu = BuildPopupMenu(menuRoot);
        if (popupMenu.Items.Count == 0)
        {
            popupMenu.Dispose();
            return;
        }

        var anchorPoint = button.PointToScreen(new Point(button.Width, 0));
        MenuPopupOpening?.Invoke(this, EventArgs.Empty);
        popupMenu.Closed += (_, _) =>
        {
            if (!popupMenu.IsDisposed)
                popupMenu.BeginInvoke(new Action(popupMenu.Dispose));
            MenuPopupClosed?.Invoke(this, EventArgs.Empty);
        };
        popupMenu.Show(anchorPoint);
    }

    private static ContextMenuStrip BuildPopupMenu(ToolStripMenuItem menuRoot)
    {
        var popup = new ContextMenuStrip();
        AppTheme.StyleContextMenu(popup);

        foreach (ToolStripItem sourceItem in menuRoot.DropDownItems)
        {
            if (CreatePopupItem(sourceItem) is { } cloned)
                popup.Items.Add(cloned);
        }

        AppTheme.ApplyToolStripItems(popup.Items);
        return popup;
    }

    private static ToolStripItem? CreatePopupItem(ToolStripItem sourceItem)
    {
        if (sourceItem is ToolStripSeparator)
            return new ToolStripSeparator();

        if (sourceItem is not ToolStripMenuItem sourceMenuItem)
            return null;

        var popupItem = new ToolStripMenuItem
        {
            Text = sourceMenuItem.Text,
            Image = sourceMenuItem.Image is null ? null : new Bitmap(sourceMenuItem.Image),
            Enabled = sourceMenuItem.Enabled,
            Checked = sourceMenuItem.Checked,
            CheckState = sourceMenuItem.CheckState,
            ShowShortcutKeys = sourceMenuItem.ShowShortcutKeys,
            ShortcutKeys = sourceMenuItem.ShortcutKeys,
            ShortcutKeyDisplayString = sourceMenuItem.ShortcutKeyDisplayString,
            ToolTipText = sourceMenuItem.ToolTipText
        };

        popupItem.Click += (_, _) => MenuItemClickForwarder.Invoke(sourceMenuItem);

        foreach (ToolStripItem child in sourceMenuItem.DropDownItems)
        {
            if (CreatePopupItem(child) is { } childClone)
                popupItem.DropDownItems.Add(childClone);
        }

        return popupItem;
    }

    private void Relayout()
    {
        var y = Padding.Top;
        var centerX = Math.Max(Padding.Left, (Width - 44) / 2);

        foreach (var entry in _entries)
        {
            if (!entry.Button.Visible)
                continue;

            entry.Button.Location = new Point(centerX, y);
            y += entry.Button.Height + 4;
        }

        if (_bottomAction != null)
        {
            _bottomAction.Button.Location = new Point(
                centerX,
                Math.Max(Padding.Top, Height - Padding.Bottom - _bottomAction.Button.Height));
        }
    }

    protected override void OnSizeChanged(EventArgs e)
    {
        base.OnSizeChanged(e);
        Relayout();
    }

    private static void SetButtonIcon(Button button, Bitmap icon)
    {
        button.Image?.Dispose();
        button.Image = icon;
        button.ImageAlign = ContentAlignment.MiddleCenter;
        button.Text = string.Empty;
    }

    private void OnThemeChanged()
    {
        if (IsDisposed)
            return;

        if (InvokeRequired)
        {
            BeginInvoke(RefreshTheme);
            return;
        }

        RefreshTheme();
    }
}
