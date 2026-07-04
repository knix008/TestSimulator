namespace MyWorkspace.Win;

internal sealed class PageTabBar : Panel
{
    public event EventHandler<int>? TabSelected;
    public event EventHandler<int>? TabCloseRequested;

    private const int NavButtonWidth = 22;

    private readonly ClippingPanel _tabsHost = new();
    private readonly Label _btnScrollPrev = new();
    private readonly Label _btnScrollNext = new();
    private readonly Dictionary<int, PageTabButton> _tabs = new();
    private readonly List<int> _tabOrder = [];
    private int? _selectedPageId;
    private int _scrollOffset;
    private bool _prevHover;
    private bool _nextHover;

    public PageTabBar()
    {
        AutoSize = false;
        Height = 34;
        Dock = DockStyle.Top;
        Padding = new Padding(8, 4, 8, 0);
        BackColor = Color.Transparent;
        Tag = "layout";
        DoubleBuffered = true;
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);

        _tabsHost.Dock = DockStyle.Fill;
        _tabsHost.AutoScroll = false;
        _tabsHost.Padding = Padding.Empty;
        _tabsHost.Margin = Padding.Empty;
        _tabsHost.BackColor = Color.Transparent;

        ConfigureNavButton(_btnScrollPrev, "<");
        ConfigureNavButton(_btnScrollNext, ">");
        _btnScrollPrev.Dock = DockStyle.Left;
        _btnScrollNext.Dock = DockStyle.Right;
        _btnScrollPrev.Visible = false;
        _btnScrollNext.Visible = false;
        _btnScrollPrev.Click += (_, _) => ScrollBy(-1);
        _btnScrollNext.Click += (_, _) => ScrollBy(1);
        _btnScrollPrev.MouseEnter += (_, _) => { _prevHover = true; ApplyNavButtonColors(_btnScrollPrev, _prevHover, canScroll: _scrollOffset > 0); };
        _btnScrollPrev.MouseLeave += (_, _) => { _prevHover = false; ApplyNavButtonColors(_btnScrollPrev, _prevHover, canScroll: _scrollOffset > 0); };
        _btnScrollNext.MouseEnter += (_, _) => { _nextHover = true; ApplyNavButtonColors(_btnScrollNext, _nextHover, canScroll: CanScrollForward()); };
        _btnScrollNext.MouseLeave += (_, _) => { _nextHover = false; ApplyNavButtonColors(_btnScrollNext, _nextHover, canScroll: CanScrollForward()); };

        Controls.Add(_tabsHost);
        Controls.Add(_btnScrollPrev);
        Controls.Add(_btnScrollNext);

        _tabsHost.Resize += (_, _) => UpdateTabViewport();
        Resize += (_, _) => UpdateTabViewport();
    }

    private void ConfigureNavButton(Label button, string text)
    {
        button.AutoSize = false;
        button.Width = NavButtonWidth;
        button.Text = text;
        button.TextAlign = ContentAlignment.MiddleCenter;
        button.Cursor = Cursors.Hand;
        button.Font = AppTheme.UiFontSemibold;
        button.Padding = Padding.Empty;
        button.Margin = Padding.Empty;
        button.TabStop = false;
    }

    protected override void OnVisibleChanged(EventArgs e)
    {
        base.OnVisibleChanged(e);
        if (Visible)
            RelayoutTabs();
    }

    public void ApplyTheme()
    {
        BackColor = AppTheme.EditorBackground;
        _tabsHost.BackColor = AppTheme.EditorBackground;
        foreach (var tab in _tabs.Values)
            tab.ApplyTheme(_selectedPageId == tab.PageId);

        ApplyNavButtonColors(_btnScrollPrev, _prevHover, canScroll: _scrollOffset > 0);
        ApplyNavButtonColors(_btnScrollNext, _nextHover, canScroll: CanScrollForward());
        RelayoutTabs();
    }

    public void SetSelectedTab(int? selectedPageId)
    {
        if (_selectedPageId == selectedPageId)
            return;

        var previousId = _selectedPageId;
        _selectedPageId = selectedPageId;

        if (previousId is int prev && _tabs.TryGetValue(prev, out var previousTab))
            previousTab.SetSelected(false);

        if (selectedPageId is int next && _tabs.TryGetValue(next, out var nextTab))
            nextTab.SetSelected(true);

        EnsureSelectedTabVisible();
    }

    public void SetTabs(IReadOnlyList<PageTabBarItem> tabs, int? selectedPageId)
    {
        SuspendLayout();
        _tabsHost.SuspendLayout();
        try
        {
            var nextIds = tabs.Select(t => t.PageId).ToHashSet();

            foreach (var pageId in _tabs.Keys.Where(id => !nextIds.Contains(id)).ToList())
            {
                _tabsHost.Controls.Remove(_tabs[pageId]);
                _tabs[pageId].Dispose();
                _tabs.Remove(pageId);
            }

            _tabOrder.Clear();
            foreach (var item in tabs)
            {
                _tabOrder.Add(item.PageId);

                if (!_tabs.TryGetValue(item.PageId, out var tab))
                {
                    tab = new PageTabButton(item.PageId);
                    tab.Selected += (_, pageId) => TabSelected?.Invoke(this, pageId);
                    tab.CloseRequested += (_, pageId) => TabCloseRequested?.Invoke(this, pageId);
                    _tabs[item.PageId] = tab;
                    _tabsHost.Controls.Add(tab);
                }

                tab.Update(item.Title, item.IsDirty, selectedPageId == item.PageId);
            }

            SyncTabOrder(tabs);
            _selectedPageId = selectedPageId;
        }
        finally
        {
            _tabsHost.ResumeLayout(false);
            ResumeLayout(true);
            RelayoutTabs();
        }
    }

    public void RelayoutTabs()
    {
        foreach (var tab in _tabs.Values)
            tab.EnsureLayout();

        UpdateTabViewport();
    }

    private void SyncTabOrder(IReadOnlyList<PageTabBarItem> tabs)
    {
        if (tabs.Count == 0)
        {
            if (_tabsHost.Controls.Count > 0)
                _tabsHost.Controls.Clear();
            return;
        }

        var needsRebuild = _tabsHost.Controls.Count != tabs.Count;
        if (!needsRebuild)
        {
            for (var i = 0; i < tabs.Count; i++)
            {
                if (!ReferenceEquals(_tabsHost.Controls[i], _tabs[tabs[i].PageId]))
                {
                    needsRebuild = true;
                    break;
                }
            }
        }

        if (!needsRebuild)
            return;

        _tabsHost.Controls.Clear();
        foreach (var item in tabs)
        {
            if (_tabs.TryGetValue(item.PageId, out var tab))
                _tabsHost.Controls.Add(tab);
        }
    }

    private void UpdateTabViewport()
    {
        if (!IsHandleCreated)
            return;

        var overflow = GetTotalTabsWidth() > _tabsHost.ClientSize.Width;
        if (!overflow)
            _scrollOffset = 0;

        ClampScrollOffset();
        ApplyTabPositions();
        UpdateNavButtons();
        EnsureSelectedTabVisible();
    }

    private void ApplyTabPositions()
    {
        var x = -_scrollOffset;
        foreach (var pageId in _tabOrder)
        {
            if (!_tabs.TryGetValue(pageId, out var tab))
                continue;

            tab.Location = new Point(x, 0);
            x += tab.Width + tab.Margin.Right;
        }
    }

    private int GetTotalTabsWidth()
    {
        var total = 0;
        foreach (var pageId in _tabOrder)
        {
            if (_tabs.TryGetValue(pageId, out var tab))
                total += tab.Width + tab.Margin.Right;
        }

        return total;
    }

    private int GetMaxScrollOffset() =>
        Math.Max(0, GetTotalTabsWidth() - _tabsHost.ClientSize.Width);

    private bool CanScrollForward() => _scrollOffset < GetMaxScrollOffset();

    private void ClampScrollOffset() =>
        _scrollOffset = Math.Clamp(_scrollOffset, 0, GetMaxScrollOffset());

    private void UpdateNavButtons()
    {
        var overflow = GetTotalTabsWidth() > _tabsHost.ClientSize.Width;
        _btnScrollPrev.Visible = overflow;
        _btnScrollNext.Visible = overflow;

        var canScrollBack = _scrollOffset > 0;
        var canScrollForward = CanScrollForward();
        _btnScrollPrev.Enabled = canScrollBack;
        _btnScrollNext.Enabled = canScrollForward;

        ApplyNavButtonColors(_btnScrollPrev, _prevHover, canScrollBack);
        ApplyNavButtonColors(_btnScrollNext, _nextHover, canScrollForward);
    }

    private void ApplyNavButtonColors(Label button, bool hover, bool canScroll)
    {
        button.BackColor = hover && canScroll ? AppTheme.AccentHover : Color.Transparent;
        button.ForeColor = !canScroll
            ? AppTheme.TextMuted
            : hover
                ? AppTheme.Accent
                : AppTheme.TextSecondary;
    }

    private void ScrollBy(int direction)
    {
        if (direction == 0 || _tabOrder.Count == 0)
            return;

        var leadingIndex = GetLeadingVisibleTabIndex();
        var targetIndex = direction < 0
            ? Math.Max(0, leadingIndex - 1)
            : Math.Min(_tabOrder.Count - 1, leadingIndex + 1);

        _scrollOffset = GetTabLeft(targetIndex);
        ClampScrollOffset();
        ApplyTabPositions();
        UpdateNavButtons();
    }

    private int GetLeadingVisibleTabIndex()
    {
        var viewportLeft = _scrollOffset;
        for (var i = 0; i < _tabOrder.Count; i++)
        {
            if (GetTabRight(i) > viewportLeft)
                return i;
        }

        return Math.Max(0, _tabOrder.Count - 1);
    }

    private int GetTabLeft(int index)
    {
        var x = 0;
        for (var i = 0; i < index; i++)
        {
            if (!_tabs.TryGetValue(_tabOrder[i], out var tab))
                continue;

            x += tab.Width + tab.Margin.Right;
        }

        return x;
    }

    private int GetTabRight(int index)
    {
        if (!_tabs.TryGetValue(_tabOrder[index], out var tab))
            return 0;

        return GetTabLeft(index) + tab.Width + tab.Margin.Right;
    }

    private void EnsureSelectedTabVisible()
    {
        if (_selectedPageId is not int selectedId)
            return;

        var index = _tabOrder.IndexOf(selectedId);
        if (index < 0 || !_tabs.TryGetValue(selectedId, out var tab))
            return;

        var tabLeft = GetTabLeft(index);
        var tabRight = tabLeft + tab.Width + tab.Margin.Right;
        var viewportLeft = _scrollOffset;
        var viewportRight = _scrollOffset + _tabsHost.ClientSize.Width;

        if (tabLeft < viewportLeft)
            _scrollOffset = tabLeft;
        else if (tabRight > viewportRight)
            _scrollOffset = tabRight - _tabsHost.ClientSize.Width;

        ClampScrollOffset();
        ApplyTabPositions();
        UpdateNavButtons();
    }

    private sealed class ClippingPanel : Panel
    {
        public ClippingPanel()
        {
            DoubleBuffered = true;
            SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);
        }

        protected override CreateParams CreateParams
        {
            get
            {
                var cp = base.CreateParams;
                cp.ExStyle |= 0x02000000;
                return cp;
            }
        }
    }

    private sealed class PageTabButton : Panel
    {
        public event EventHandler<int>? Selected;
        public event EventHandler<int>? CloseRequested;

        private readonly TitleGlyph _lblTitle = new();
        private readonly CloseGlyph _btnClose = new();
        private bool _isSelected;
        private bool _isHovered;
        private bool _closeHover;
        private string _displayTitle = string.Empty;
        private Font? _closeFont;

        public int PageId { get; }

        public PageTabButton(int pageId)
        {
            PageId = pageId;
            AutoSize = false;
            Margin = new Padding(0, 0, 12, 0);
            Padding = new Padding(0, 2, 0, 6);
            Cursor = Cursors.Hand;
            TabStop = false;
            DoubleBuffered = true;
            SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);

            _lblTitle.Cursor = Cursors.Hand;
            _lblTitle.Font = AppTheme.UiFont;
            _lblTitle.Click += (_, _) => Selected?.Invoke(this, PageId);

            _closeFont = new Font(AppTheme.UiFont.FontFamily, AppTheme.UiFont.Size + 3f, FontStyle.Regular);
            _btnClose.Cursor = Cursors.Hand;
            _btnClose.Font = _closeFont;
            _btnClose.Click += (_, _) => CloseRequested?.Invoke(this, PageId);
            _btnClose.MouseEnter += (_, _) =>
            {
                _closeHover = true;
                ApplyCloseColors();
            };
            _btnClose.MouseLeave += (_, _) =>
            {
                _closeHover = false;
                ApplyCloseColors();
            };

            Controls.Add(_lblTitle);
            Controls.Add(_btnClose);
            Click += OnTabClick;
            _lblTitle.Click += OnTabClick;
            MouseEnter += (_, _) => SetHovered(true);
            MouseLeave += (_, _) => SetHovered(false);
        }

        private void SetHovered(bool hovered)
        {
            if (_isHovered == hovered)
                return;

            _isHovered = hovered;
            UpdateVisualState();
        }

        private void OnTabClick(object? sender, EventArgs e)
        {
            Selected?.Invoke(this, PageId);
        }

        public void EnsureLayout() => Relayout();

        public void Update(string title, bool isDirty, bool isSelected)
        {
            var displayTitle = string.IsNullOrWhiteSpace(title)
                ? Localization.Get(K.UntitledPageTitle)
                : title.Trim();
            if (isDirty)
                displayTitle += " •";

            _displayTitle = displayTitle;
            _lblTitle.DisplayText = displayTitle;
            Relayout();
            SetSelected(isSelected);
        }

        private void Relayout()
        {
            if (string.IsNullOrEmpty(_displayTitle))
                return;

            const int horizontalGap = 4;
            const int closeHitWidth = 18;
            const int topInset = 2;
            const int underlineSpace = 6;

            var textFlags = TextFormatFlags.NoPadding | TextFormatFlags.SingleLine;
            var titleSize = TextRenderer.MeasureText(
                _displayTitle,
                _lblTitle.Font,
                new Size(int.MaxValue, int.MaxValue),
                textFlags);
            var closeSize = TextRenderer.MeasureText(
                "x",
                _closeFont,
                Size.Empty,
                textFlags);

            var rowHeight = Math.Max(titleSize.Height, closeSize.Height);

            _lblTitle.SetBounds(0, topInset, titleSize.Width, rowHeight);
            _btnClose.SetBounds(_lblTitle.Right + horizontalGap, topInset, closeHitWidth, rowHeight);
            Size = new Size(_btnClose.Right, topInset + rowHeight + underlineSpace);
        }

        private sealed class TitleGlyph : Control
        {
            private string _displayText = string.Empty;

            [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
            [System.ComponentModel.Browsable(false)]
            public string DisplayText
            {
                get => _displayText;
                set
                {
                    if (_displayText == value)
                        return;

                    _displayText = value;
                    Invalidate();
                }
            }

            public TitleGlyph()
            {
                SetStyle(
                    ControlStyles.AllPaintingInWmPaint
                    | ControlStyles.OptimizedDoubleBuffer
                    | ControlStyles.UserPaint
                    | ControlStyles.ResizeRedraw,
                    true);
                TabStop = false;
            }

            protected override void OnPaint(PaintEventArgs e)
            {
                e.Graphics.Clear(BackColor);
                if (string.IsNullOrEmpty(_displayText))
                    return;

                TextRenderer.DrawText(
                    e.Graphics,
                    _displayText,
                    Font,
                    ClientRectangle,
                    ForeColor,
                    TextFormatFlags.Left
                    | TextFormatFlags.VerticalCenter
                    | TextFormatFlags.NoPadding
                    | TextFormatFlags.SingleLine);
            }
        }

        private sealed class CloseGlyph : Control
        {
            [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
            [System.ComponentModel.Browsable(false)]
            public int PaintOffsetY { get; set; } = -3;

            public CloseGlyph()
            {
                SetStyle(
                    ControlStyles.AllPaintingInWmPaint
                    | ControlStyles.OptimizedDoubleBuffer
                    | ControlStyles.UserPaint
                    | ControlStyles.ResizeRedraw,
                    true);
                TabStop = false;
            }

            protected override void OnPaint(PaintEventArgs e)
            {
                e.Graphics.Clear(BackColor);
                var textRect = ClientRectangle;
                textRect.Offset(0, PaintOffsetY);
                TextRenderer.DrawText(
                    e.Graphics,
                    "x",
                    Font,
                    textRect,
                    ForeColor,
                    TextFormatFlags.HorizontalCenter
                    | TextFormatFlags.VerticalCenter
                    | TextFormatFlags.NoPadding
                    | TextFormatFlags.SingleLine);
            }
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
                _closeFont?.Dispose();

            base.Dispose(disposing);
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            Relayout();
        }

        protected override void OnVisibleChanged(EventArgs e)
        {
            base.OnVisibleChanged(e);
            if (Visible)
                Relayout();
        }

        public void SetSelected(bool isSelected)
        {
            if (_isSelected == isSelected)
                return;

            _isSelected = isSelected;
            UpdateVisualState();
        }

        public void ApplyTheme(bool isSelected)
        {
            _isSelected = isSelected;
            UpdateVisualState();
        }

        private void UpdateVisualState()
        {
            var emphasized = _isSelected || _isHovered;

            BackColor = Color.Transparent;
            _lblTitle.BackColor = AppTheme.EditorBackground;
            _lblTitle.ForeColor = emphasized ? AppTheme.Accent : AppTheme.TextMuted;
            _lblTitle.Invalidate();

            ApplyCloseColors();
            Invalidate();
        }

        private void ApplyCloseColors()
        {
            _btnClose.BackColor = _closeHover ? AppTheme.AccentHover : AppTheme.EditorBackground;
            _btnClose.ForeColor = _closeHover ? AppTheme.Danger : AppTheme.TextSecondary;
            _btnClose.Invalidate();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            if (!_isSelected && !_isHovered)
                return;

            var y = Height - 2;
            using var pen = new Pen(AppTheme.Accent, 2f);
            e.Graphics.DrawLine(pen, 0, y, Width, y);
        }
    }
}

internal readonly record struct PageTabBarItem(int PageId, string Title, bool IsDirty);
