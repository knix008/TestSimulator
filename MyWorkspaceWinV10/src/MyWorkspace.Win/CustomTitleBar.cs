using System.ComponentModel;

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
    private readonly ToolTip _toolTip = new();

    private Form? _hostForm;
    private ContextMenuStrip? _settingsMenu;

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
        _btnClose.FlatAppearance.MouseOverBackColor = Color.FromArgb(232, 17, 35);
        _btnClose.FlatAppearance.MouseDownBackColor = Color.FromArgb(200, 15, 30);

        Controls.Add(_mark);
        Controls.Add(_lblAppName);
        Controls.Add(_btnClose);
        Controls.Add(_btnMaximize);
        Controls.Add(_btnMinimize);

        MouseDown += OnDragMouseDown;
        _lblAppName.MouseDown += OnDragMouseDown;
        _mark.SettingsMenuRequested += OnSettingsMenuRequested;

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

    public void Attach(Form hostForm)
    {
        _hostForm = hostForm;
        hostForm.Resize += (_, _) => UpdateMaximizeGlyph();
        UpdateMaximizeGlyph();
    }

    public void SetAppName(string appName)
    {
        _lblAppName.Text = appName;
        Invalidate();
    }

    public void SetMarkTooltip(string text) =>
        _toolTip.SetToolTip(_mark, text);

    public void ApplyTheme()
    {
        BackColor = AppTheme.TitleBarBackground;
        _lblAppName.BackColor = AppTheme.TitleBarBackground;
        _lblAppName.Font = AppTheme.HeaderFont;
        _lblAppName.ForeColor = AppTheme.TitleBarText;
        _mark.Invalidate();

        var hover = AppTheme.IsDark
            ? Color.FromArgb(48, 54, 61)
            : Color.FromArgb(225, 228, 232);
        var pressed = AppTheme.IsDark
            ? Color.FromArgb(68, 76, 86)
            : Color.FromArgb(208, 212, 218);

        StyleWindowButton(_btnMinimize, hover, pressed);
        StyleWindowButton(_btnMaximize, hover, pressed);
        StyleWindowButton(_btnClose, hover, pressed);
        _btnClose.ForeColor = AppTheme.TitleBarText;

        Invalidate(true);
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

        var textRight = right - ButtonWidth * 3 - 8;
        _lblAppName.SetBounds(
            12 + MarkWidth + 8,
            0,
            Math.Max(80, textRight - (12 + MarkWidth + 8)),
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

    private static void StyleWindowButton(BorderlessIconButton button, Color hover, Color pressed)
    {
        button.NormalBackColor = AppTheme.TitleBarBackground;
        button.BackColor = AppTheme.TitleBarBackground;
        button.ForeColor = AppTheme.TitleBarText;
        button.FlatAppearance.MouseOverBackColor = hover;
        button.FlatAppearance.MouseDownBackColor = pressed;
        button.Invalidate();
    }

    private void OnThemeChanged() => ApplyTheme();

    private void OnDragMouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left || _hostForm == null)
            return;

        FramelessWindowHelper.BeginDrag(_hostForm);
    }

    private void OnSettingsMenuRequested(object? sender, EventArgs e)
    {
        if (_settingsMenu == null)
            return;

        var location = _mark.PointToScreen(new Point(0, _mark.Height));
        _settingsMenu.Show(location);
    }

    private void OnMinimizeClick(object? sender, EventArgs e) =>
        _hostForm!.WindowState = FormWindowState.Minimized;

    private void OnMaximizeClick(object? sender, EventArgs e)
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
                    ? AppTheme.IsDark ? Color.FromArgb(68, 76, 86) : Color.FromArgb(208, 212, 218)
                    : AppTheme.IsDark ? Color.FromArgb(48, 54, 61) : Color.FromArgb(225, 228, 232);
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
