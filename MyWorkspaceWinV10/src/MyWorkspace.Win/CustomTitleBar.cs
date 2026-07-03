using System.ComponentModel;
using MyWorkspace.Core.Models;

namespace MyWorkspace.Win;

internal sealed class CustomTitleBar : Panel
{
    private const int BarHeight = 36;
    private const int MarkWidth = 18;
    private const int MarkBarWidth = 3;
    private const int MarkGap = 2;
    private const int ButtonWidth = 46;

    private readonly AppMarkControl _mark = new();
    private readonly Label _lblAppName = new();
    private readonly BorderlessIconButton _btnMinimize = new();
    private readonly BorderlessIconButton _btnMaximize = new();
    private readonly BorderlessIconButton _btnClose = new();
    private readonly TitleBarPageSearchBox _pageSearch = new();
    private readonly ToolTip _toolTip = new();

    private Form? _hostForm;
    private ContextMenuStrip? _settingsMenu;
    private int? _editorRegionLeft;

    public event EventHandler<PageSearchSelection>? PageSearchSelected;

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public ContextMenuStrip? SettingsMenu
    {
        get => _settingsMenu;
        set
        {
            _settingsMenu = value;
            _mark.SettingsMenu = value;
        }
    }

    public CustomTitleBar()
    {
        Height = BarHeight;
        MinimumSize = new Size(0, BarHeight);
        MaximumSize = new Size(0, BarHeight);
        Dock = DockStyle.Top;
        Padding = new Padding(12, 0, 0, 0);
        TabStop = false;
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);
        UpdateStyles();

        _mark.Size = new Size(MarkWidth, BarHeight);
        _mark.Location = new Point(12, 0);
        _mark.TabStop = false;
        _mark.Cursor = Cursors.Hand;

        _lblAppName.AutoSize = false;
        _lblAppName.Location = new Point(12 + MarkWidth + 8, 0);
        _lblAppName.Size = new Size(320, BarHeight);
        _lblAppName.TextAlign = ContentAlignment.MiddleLeft;
        _lblAppName.TabStop = false;
        _lblAppName.BackColor = AppTheme.TitleBarBackground;

        ConfigureWindowButton(_btnMinimize, WindowChromeGlyph.Minimize, OnMinimizeClick);
        ConfigureWindowButton(_btnMaximize, WindowChromeGlyph.Maximize, OnMaximizeClick);
        ConfigureWindowButton(_btnClose, WindowChromeGlyph.Close, OnCloseClick);

        Controls.Add(_mark);
        Controls.Add(_lblAppName);
        Controls.Add(_pageSearch);
        Controls.Add(_btnClose);
        Controls.Add(_btnMaximize);
        Controls.Add(_btnMinimize);

        MouseDown += OnDragMouseDown;
        DoubleClick += OnTitleBarDoubleClick;
        _lblAppName.MouseDown += OnDragMouseDown;
        _lblAppName.DoubleClick += OnTitleBarDoubleClick;
        _mark.SettingsMenuRequested += OnSettingsMenuRequested;
        _pageSearch.PageSelected += (_, selection) => PageSearchSelected?.Invoke(this, selection);

        if (!DesignMode)
            AppTheme.Changed += OnThemeChanged;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            if (!DesignMode)
                AppTheme.Changed -= OnThemeChanged;
            _toolTip.Dispose();
        }

        base.Dispose(disposing);
    }

    public void SetPageSearchProvider(Func<string, IReadOnlyList<PageSearchResult>>? provider) =>
        _pageSearch.SetSearchProvider(provider);

    public void ClearPageSearch() => _pageSearch.ClearSearch();

    public void SetPageSearchEnabled(bool enabled)
    {
        _pageSearch.Enabled = enabled;
        if (!enabled)
        {
            _pageSearch.ClearSearch();
            _pageSearch.Visible = false;
            LayoutControls();
            return;
        }

        LayoutControls();
    }

    public void Attach(Form hostForm)
    {
        _hostForm = hostForm;
        hostForm.Resize += (_, _) =>
        {
            UpdateMaximizeGlyph();
            LayoutControls();
        };
        UpdateMaximizeGlyph();
        LayoutControls();
    }

    public void SetAppName(string appName)
    {
        _lblAppName.Text = appName;
        Invalidate();
    }

    public void SetMarkTooltip(string text) =>
        _toolTip.SetToolTip(_mark, text);

    public void SetEditorRegionLeft(int clientX)
    {
        var clamped = Math.Clamp(clientX, 0, ClientSize.Width > 0 ? ClientSize.Width : clientX);
        if (_editorRegionLeft == clamped)
            return;

        _editorRegionLeft = clamped;
        LayoutControls();
        Invalidate();
    }

    public void ApplyTheme()
    {
        BackColor = AppTheme.TitleBarBackground;
        _lblAppName.BackColor = AppTheme.TitleBarBackground;
        _lblAppName.Font = AppTheme.HeaderFont;
        _lblAppName.ForeColor = AppTheme.TitleBarText;
        _mark.Invalidate();

        var hover = AppTheme.ChromeButtonHoverBackground;
        var pressed = AppTheme.ChromeButtonPressedBackground;

        StyleWindowButton(_btnMinimize, AppTheme.EditorBackground, hover, pressed);
        StyleWindowButton(_btnMaximize, AppTheme.EditorBackground, hover, pressed);
        StyleWindowButton(_btnClose, AppTheme.EditorBackground, hover, pressed);
        _pageSearch.ApplyTheme();
        AppTheme.StyleToolTip(_toolTip);

        Invalidate(true);
    }

    protected override void OnPaintBackground(PaintEventArgs e)
    {
        var width = ClientSize.Width;
        var height = ClientSize.Height;
        if (width <= 0 || height <= 0)
            return;

        var splitX = Math.Clamp(_editorRegionLeft ?? width, 0, width);

        using (var sidebarBrush = new SolidBrush(AppTheme.TitleBarBackground))
            e.Graphics.FillRectangle(sidebarBrush, 0, 0, splitX, height);

        if (splitX < width)
        {
            using var editorBrush = new SolidBrush(AppTheme.EditorBackground);
            e.Graphics.FillRectangle(editorBrush, splitX, 0, width - splitX, height);
        }
    }

    protected override void OnResize(EventArgs eventargs)
    {
        base.OnResize(eventargs);
        LayoutControls();
    }

    protected override void WndProc(ref Message m)
    {
        const int wmEraseBkgnd = 0x0014;
        if (m.Msg == wmEraseBkgnd)
            return;

        base.WndProc(ref m);
    }

    private void LayoutControls()
    {
        var right = ClientSize.Width;
        _btnClose.SetBounds(right - ButtonWidth, 0, ButtonWidth, BarHeight);
        _btnMaximize.SetBounds(right - ButtonWidth * 2, 0, ButtonWidth, BarHeight);
        _btnMinimize.SetBounds(right - ButtonWidth * 3, 0, ButtonWidth, BarHeight);

        const int searchMarginRight = 12;
        const int searchPreferredWidth = 280;
        const int searchMinWidth = 160;
        const int searchHeight = 30;
        const int appNameLeft = 12 + MarkWidth + 8;
        const int appNameMinWidth = 72;

        var chromeRight = right - ButtonWidth * 3 - searchMarginRight;
        var appNameRight = appNameLeft + appNameMinWidth;
        var maxSearchWidth = Math.Max(0, chromeRight - appNameRight - 12);
        var searchWidth = Math.Min(searchPreferredWidth, maxSearchWidth);
        var showSearch = _pageSearch.Enabled && searchWidth >= searchMinWidth;

        if (showSearch)
        {
            _pageSearch.Visible = true;
            _pageSearch.SetBounds(
                chromeRight - searchWidth,
                (BarHeight - searchHeight) / 2,
                searchWidth,
                searchHeight);
            _pageSearch.BringToFront();
        }
        else
        {
            _pageSearch.Visible = false;
        }

        var textRight = showSearch ? _pageSearch.Left - 8 : chromeRight;
        _lblAppName.SetBounds(
            appNameLeft,
            0,
            Math.Max(appNameMinWidth, textRight - appNameLeft),
            BarHeight);
    }

    private static void ConfigureWindowButton(BorderlessIconButton button, WindowChromeGlyph glyph, EventHandler onClick)
    {
        button.ChromeGlyph = glyph;
        button.Text = string.Empty;
        button.Size = new Size(ButtonWidth, BarHeight);
        button.TabStop = false;
        button.Click += onClick;
    }

    private static void StyleWindowButton(BorderlessIconButton button, Color normalBack, Color hover, Color pressed)
    {
        button.NormalBackColor = normalBack;
        button.BackColor = normalBack;
        button.ForeColor = AppTheme.ChromeButtonIconColor;
        button.FlatAppearance.MouseOverBackColor = hover;
        button.FlatAppearance.MouseDownBackColor = pressed;
        button.Invalidate();
    }

    private void OnThemeChanged() => ApplyTheme();

    private void OnDragMouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left || _hostForm == null || e.Clicks > 1)
            return;

        FramelessWindowHelper.BeginDrag(_hostForm);
    }

    private void OnTitleBarDoubleClick(object? sender, EventArgs e) =>
        ToggleMaximizeWindow();

    private void OnSettingsMenuRequested(object? sender, EventArgs e)
    {
        if (_settingsMenu == null)
            return;

        var location = _mark.PointToScreen(new Point(0, _mark.Height));
        _settingsMenu.Show(location);
    }

    private void OnMinimizeClick(object? sender, EventArgs e) =>
        _hostForm!.WindowState = FormWindowState.Minimized;

    private void OnMaximizeClick(object? sender, EventArgs e) =>
        ToggleMaximizeWindow();

    private void ToggleMaximizeWindow()
    {
        if (_hostForm == null)
            return;

        _hostForm.WindowState = _hostForm.WindowState == FormWindowState.Maximized
            ? FormWindowState.Normal
            : FormWindowState.Maximized;
        UpdateMaximizeGlyph();
    }

    private void OnCloseClick(object? sender, EventArgs e) => _hostForm?.Close();

    private void UpdateMaximizeGlyph()
    {
        if (_hostForm == null)
            return;

        _btnMaximize.ChromeGlyph = _hostForm.WindowState == FormWindowState.Maximized
            ? WindowChromeGlyph.Restore
            : WindowChromeGlyph.Maximize;
        _btnMaximize.Invalidate();
    }

    private sealed class AppMarkControl : Control
    {
        private const int MarkBarHeight = 16;

        private bool _hover;
        private bool _pressed;

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public ContextMenuStrip? SettingsMenu { get; set; }

        public event EventHandler? SettingsMenuRequested;

        public AppMarkControl()
        {
            SetStyle(
                ControlStyles.AllPaintingInWmPaint |
                ControlStyles.OptimizedDoubleBuffer |
                ControlStyles.UserPaint,
                true);
            TabStop = false;
            Cursor = Cursors.Hand;
        }

        protected override void WndProc(ref Message m)
        {
            const int wmEraseBkgnd = 0x0014;
            if (m.Msg == wmEraseBkgnd)
                return;

            base.WndProc(ref m);
        }

        protected override void OnMouseEnter(EventArgs e)
        {
            _hover = true;
            Invalidate();
            base.OnMouseEnter(e);
        }

        protected override void OnMouseLeave(EventArgs e)
        {
            _hover = false;
            _pressed = false;
            Invalidate();
            base.OnMouseLeave(e);
        }

        protected override void OnMouseDown(MouseEventArgs e)
        {
            if (e.Button == MouseButtons.Left)
                _pressed = true;
            Invalidate();
            base.OnMouseDown(e);
        }

        protected override void OnMouseUp(MouseEventArgs mevent)
        {
            if (_pressed && mevent.Button == MouseButtons.Left && ClientRectangle.Contains(mevent.Location))
                SettingsMenuRequested?.Invoke(this, EventArgs.Empty);

            _pressed = false;
            Invalidate();
            base.OnMouseUp(mevent);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            e.Graphics.Clear(Parent?.BackColor ?? AppTheme.TitleBarBackground);

            if (_hover || _pressed)
            {
                var backColor = _pressed
                    ? AppTheme.ChromeButtonPressedBackground
                    : AppTheme.ChromeButtonHoverBackground;
                using var brush = new SolidBrush(backColor);
                e.Graphics.FillRectangle(brush, ClientRectangle);
            }

            e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.None;
            e.Graphics.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.None;

            var markColor = ResolveUniformMarkColor();
            var totalWidth = MarkBarWidth * 3 + MarkGap * 2;
            var startX = (Width - totalWidth) / 2;
            var top = (Height - MarkBarHeight) / 2;

            using var markBrush = new SolidBrush(markColor);
            for (var i = 0; i < 3; i++)
            {
                var x = startX + i * (MarkBarWidth + MarkGap);
                e.Graphics.FillRectangle(markBrush, x, top, MarkBarWidth, MarkBarHeight);
            }
        }

        private static Color ResolveUniformMarkColor()
        {
            var background = AppTheme.TitleBarBackground;
            var candidates = new[]
            {
                AppTheme.Accent,
                AppTheme.TextPrimary,
                AppTheme.IsDark ? Color.FromArgb(196, 204, 214) : Color.FromArgb(72, 78, 88)
            };

            foreach (var candidate in candidates)
            {
                if (GetContrastRatio(candidate, background) >= 3.0)
                    return candidate;
            }

            return candidates[^1];
        }

        private static double GetContrastRatio(Color foreground, Color background)
        {
            var l1 = GetRelativeLuminance(foreground);
            var l2 = GetRelativeLuminance(background);
            var lighter = Math.Max(l1, l2);
            var darker = Math.Min(l1, l2);
            return (lighter + 0.05) / (darker + 0.05);
        }

        private static double GetRelativeLuminance(Color color)
        {
            static double Channel(int value)
            {
                var channel = value / 255d;
                return channel <= 0.03928
                    ? channel / 12.92
                    : Math.Pow((channel + 0.055) / 1.055, 2.4);
            }

            var r = Channel(color.R);
            var g = Channel(color.G);
            var b = Channel(color.B);
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        }
    }
}
