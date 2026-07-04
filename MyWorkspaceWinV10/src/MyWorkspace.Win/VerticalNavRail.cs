namespace MyWorkspace.Win;

internal sealed class VerticalNavRail : Panel
{
    public event EventHandler? MenuPopupOpening;
    public event EventHandler? MenuPopupClosed;

    private enum BottomEntryKind
    {
        Action,
        Menu,
        ContextMenu
    }

    private sealed class NavEntry
    {
        public required Button Button { get; init; }
        public required ToolStripMenuItem MenuRoot { get; init; }
        public required string IconName { get; init; }
        public required string TooltipKey { get; init; }
        public bool IsPressed { get; set; }
    }

    private sealed class BottomEntry
    {
        public required Button Button { get; init; }
        public required BottomEntryKind Kind { get; init; }
        public ToolStripMenuItem? MenuRoot { get; init; }
        public ToolStripMenuItem? MenuItem { get; init; }
        public ContextMenuStrip? ContextMenu { get; init; }
        public required string IconName { get; init; }
        public required string TooltipKey { get; init; }
    }

    private readonly List<NavEntry> _entries = [];
    private readonly List<BottomEntry> _bottomEntries = [];
    private readonly ToolTip _toolTip = new();
    private NavRailPopupMenu? _activePopup;

    public VerticalNavRail()
    {
        Name = "navRail";
        Width = 56;
        MinimumSize = new Size(56, 0);
        Dock = DockStyle.Left;
        Padding = new Padding(4, 8, 4, 8);
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
            foreach (var entry in _bottomEntries)
                entry.Button.Image?.Dispose();
        }

        base.Dispose(disposing);
    }

    public void AddMenu(ToolStripMenuItem menuRoot, string iconName, string tooltipKey)
    {
        var button = CreateRailButton(iconName, tooltipKey, menuRoot);
        button.Click += OnButtonClick;

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

    public void SetEntryPressed(ToolStripMenuItem menuRoot, bool pressed)
    {
        var entry = _entries.FirstOrDefault(e => ReferenceEquals(e.MenuRoot, menuRoot));
        if (entry == null || entry.IsPressed == pressed)
            return;

        entry.IsPressed = pressed;
        ApplyEntryVisual(entry);
    }

    public void AddBottomAction(ToolStripMenuItem menuItem, string iconName, string tooltipKey)
    {
        var button = CreateRailButton(iconName, tooltipKey, menuItem);
        button.Click += OnBottomActionClick;

        _bottomEntries.Add(new BottomEntry
        {
            Button = button,
            Kind = BottomEntryKind.Action,
            MenuItem = menuItem,
            IconName = iconName,
            TooltipKey = tooltipKey
        });

        Controls.Add(button);
        Relayout();
    }

    public void AddBottomMenu(ToolStripMenuItem menuRoot, string iconName, string tooltipKey)
    {
        var button = CreateRailButton(iconName, tooltipKey, menuRoot);
        button.Click += OnButtonClick;

        _bottomEntries.Add(new BottomEntry
        {
            Button = button,
            Kind = BottomEntryKind.Menu,
            MenuRoot = menuRoot,
            IconName = iconName,
            TooltipKey = tooltipKey
        });

        Controls.Add(button);
        Relayout();
    }

    public void AddBottomContextMenu(ContextMenuStrip contextMenu, string iconName, string tooltipKey)
    {
        var button = CreateRailButton(iconName, tooltipKey, contextMenu);
        button.Click += OnBottomContextMenuClick;

        _bottomEntries.Add(new BottomEntry
        {
            Button = button,
            Kind = BottomEntryKind.ContextMenu,
            ContextMenu = contextMenu,
            IconName = iconName,
            TooltipKey = tooltipKey
        });

        Controls.Add(button);
        Relayout();
    }

    public void SetBottomActionVisible(ToolStripMenuItem menuItem, bool visible) =>
        SetBottomEntryVisible(entry => ReferenceEquals(entry.MenuItem, menuItem), visible);

    public void SetBottomMenuVisible(ToolStripMenuItem menuRoot, bool visible) =>
        SetBottomEntryVisible(entry => ReferenceEquals(entry.MenuRoot, menuRoot), visible);

    public void SetBottomContextMenuVisible(ContextMenuStrip contextMenu, bool visible) =>
        SetBottomEntryVisible(entry => ReferenceEquals(entry.ContextMenu, contextMenu), visible);

    public void RefreshIcons()
    {
        foreach (var entry in _entries)
            SetButtonIcon(entry.Button, IconAssets.Load(24, entry.IconName));

        foreach (var entry in _bottomEntries)
            SetButtonIcon(entry.Button, IconAssets.Load(24, entry.IconName));
    }

    public void RefreshTheme()
    {
        BackColor = AppTheme.Sidebar;
        AppTheme.StyleBorderedPanel(this, PanelEdges.None);
        AppTheme.StyleToolTip(_toolTip);
        foreach (var entry in _entries)
            ApplyEntryVisual(entry);
        foreach (var entry in _bottomEntries)
            AppTheme.StyleNavRailButton(entry.Button);
    }

    private static void ApplyEntryVisual(NavEntry entry) =>
        AppTheme.StyleNavRailButton(entry.Button, entry.IsPressed);

    public void RefreshTooltips()
    {
        foreach (var entry in _entries)
            _toolTip.SetToolTip(entry.Button, Localization.Get(entry.TooltipKey));
        foreach (var entry in _bottomEntries)
            _toolTip.SetToolTip(entry.Button, Localization.Get(entry.TooltipKey));
    }

    public bool CloseActiveMenu()
    {
        if (_activePopup == null)
            return false;

        return _activePopup.CloseIfVisible();
    }

    private Button CreateRailButton(string iconName, string tooltipKey, object tag)
    {
        var button = new Button
        {
            Size = new Size(44, 44),
            TabStop = false,
            Tag = tag,
            AccessibleName = tooltipKey,
            UseVisualStyleBackColor = false
        };

        SetButtonIcon(button, IconAssets.Load(24, iconName));
        AppTheme.StyleNavRailButton(button);
        _toolTip.SetToolTip(button, Localization.Get(tooltipKey));
        return button;
    }

    private void SetBottomEntryVisible(Func<BottomEntry, bool> predicate, bool visible)
    {
        var entry = _bottomEntries.FirstOrDefault(predicate);
        if (entry == null)
            return;

        entry.Button.Visible = visible;
        Relayout();
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

    private void OnBottomContextMenuClick(object? sender, EventArgs e)
    {
        if (sender is not Button button || button.Tag is not ContextMenuStrip contextMenu)
            return;

        if (!button.Visible)
            return;

        BeginInvoke(() =>
        {
            if (!button.Visible)
                return;

            var anchorPoint = button.PointToScreen(new Point(button.Width, 0));
            MenuPopupOpening?.Invoke(this, EventArgs.Empty);
            contextMenu.Closed += OnBottomContextMenuClosed;
            contextMenu.Show(anchorPoint);
        });
    }

    private void OnBottomContextMenuClosed(object? sender, ToolStripDropDownClosedEventArgs e)
    {
        if (sender is ContextMenuStrip contextMenu)
            contextMenu.Closed -= OnBottomContextMenuClosed;

        MenuPopupClosed?.Invoke(this, EventArgs.Empty);
    }

    private void ShowMenuAtButton(ToolStripMenuItem menuRoot, Button button)
    {
        CloseActiveMenu();

        var popupMenu = BuildPopupMenu(menuRoot);
        if (popupMenu.Items.Count == 0)
        {
            popupMenu.Dispose();
            return;
        }

        var anchorPoint = button.PointToScreen(new Point(button.Width, 0));
        MenuPopupOpening?.Invoke(this, EventArgs.Empty);
        _activePopup = popupMenu;
        popupMenu.Closed += OnActivePopupClosed;
        popupMenu.ShowAt(button, anchorPoint);
    }

    private void OnActivePopupClosed(object? sender, ToolStripDropDownClosedEventArgs e)
    {
        if (sender is NavRailPopupMenu popupMenu)
        {
            popupMenu.Closed -= OnActivePopupClosed;
            if (!popupMenu.IsDisposed)
                popupMenu.BeginInvoke(new Action(popupMenu.Dispose));
        }

        if (ReferenceEquals(_activePopup, sender))
            _activePopup = null;

        MenuPopupClosed?.Invoke(this, EventArgs.Empty);
    }

    private static NavRailPopupMenu BuildPopupMenu(ToolStripMenuItem menuRoot)
    {
        var popup = new NavRailPopupMenu();
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
        const int buttonSize = 44;
        var y = Padding.Top;
        var contentWidth = Math.Max(buttonSize, Width - Padding.Horizontal);
        var centerX = Padding.Left + Math.Max(0, (contentWidth - buttonSize) / 2);

        foreach (var entry in _entries)
        {
            if (!entry.Button.Visible)
                continue;

            entry.Button.Location = new Point(centerX, y);
            y += entry.Button.Height + 4;
        }

        var bottomY = Height - Padding.Bottom;
        foreach (var entry in _bottomEntries)
        {
            if (!entry.Button.Visible)
                continue;

            bottomY -= entry.Button.Height;
            entry.Button.Location = new Point(centerX, bottomY);
            bottomY -= 4;
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

