using System.ComponentModel;

namespace MyWorkspace.Win;

internal sealed class PastelColorThemePicker : Panel
{
    public event EventHandler? SelectionChanged;

    private readonly List<ColorSwatchButton> _presetButtons = [];
    private readonly Button _btnCustom = new();
    private int _selectedIndex = 4;
    private bool _useCustom;
    private Color _customColor = PastelThemeCatalog.DefaultAccent;

    public PastelColorThemePicker()
    {
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        BackColor = Color.Transparent;
        Padding = new Padding(0);
        Tag = "layout";

        var flow = new FlowLayoutPanel
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Dock = DockStyle.Top,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = true,
            Margin = Padding.Empty,
            Padding = Padding.Empty,
            BackColor = Color.Transparent,
            Tag = "layout"
        };

        foreach (var preset in PastelThemeCatalog.All)
        {
            var button = new ColorSwatchButton(preset.Accent, preset.Index)
            {
                Margin = new Padding(0, 0, 6, 6)
            };
            button.Click += (_, _) => SelectPreset(preset.Index);
            _presetButtons.Add(button);
            flow.Controls.Add(button);
        }

        _btnCustom.AutoSize = false;
        _btnCustom.Size = new Size(104, 28);
        _btnCustom.Margin = new Padding(0, 0, 6, 6);
        _btnCustom.UseVisualStyleBackColor = true;
        _btnCustom.Click += OnCustomClick;
        flow.Controls.Add(_btnCustom);

        Controls.Add(flow);
    }

    protected override void OnSizeChanged(EventArgs e)
    {
        base.OnSizeChanged(e);

        if (Controls.Count > 0 && Controls[0] is FlowLayoutPanel flow && ClientSize.Width > 0)
            flow.MaximumSize = new Size(ClientSize.Width, 0);
    }

    public void LoadFromSettings(UiSettings settings)
    {
        _useCustom = settings.UseCustomAccentColor;
        _customColor = settings.UseCustomAccentColor
            ? Color.FromArgb(settings.CustomAccentArgb)
            : PastelThemeCatalog.Get(settings.ColorThemeIndex).Accent;
        _selectedIndex = PastelThemeCatalog.NormalizeIndex(settings.ColorThemeIndex);
        RefreshSelectionVisuals();
        UpdateCustomButtonText();
    }

    public void ApplyToSettings(UiSettings settings)
    {
        settings.UseCustomAccentColor = _useCustom;
        settings.ColorThemeIndex = _selectedIndex;
        settings.CustomAccentArgb = _customColor.ToArgb();
    }

    private void SelectPreset(int index)
    {
        _useCustom = false;
        _selectedIndex = PastelThemeCatalog.NormalizeIndex(index);
        RefreshSelectionVisuals();
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    private void OnCustomClick(object? sender, EventArgs e)
    {
        using var dialog = new ColorDialog
        {
            Color = _customColor,
            FullOpen = true
        };

        if (dialog.ShowDialog(FindForm()) != DialogResult.OK)
            return;

        _useCustom = true;
        _customColor = dialog.Color;
        RefreshSelectionVisuals();
        UpdateCustomButtonText();
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    private void RefreshSelectionVisuals()
    {
        foreach (var button in _presetButtons)
            button.IsSelected = !_useCustom && button.ThemeIndex == _selectedIndex;

        _btnCustom.Font = _useCustom ? AppTheme.UiFontSemibold : AppTheme.UiFont;
    }

    private void UpdateCustomButtonText() =>
        _btnCustom.Text = Localization.Get(K.PreferencesCustomColor);

    public void ApplyTheme()
    {
        foreach (var button in _presetButtons)
            button.ApplyTheme();

        AppTheme.StyleSecondaryButton(_btnCustom);
        UpdateCustomButtonText();
        RefreshSelectionVisuals();
    }

    private sealed class ColorSwatchButton : Panel
    {
        private readonly Color _accentColor;

        public int ThemeIndex { get; }
        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public bool IsSelected { get; set; }

        public ColorSwatchButton(Color color, int themeIndex)
        {
            _accentColor = color;
            ThemeIndex = themeIndex;
            Size = new Size(28, 28);
            MinimumSize = new Size(28, 28);
            BackColor = color;
            Cursor = Cursors.Hand;
            TabStop = false;
            Tag = "swatch";
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
        }

        public void ApplyTheme() => Invalidate();

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);

            e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            var bounds = new Rectangle(0, 0, Width - 1, Height - 1);
            using (var path = CreateRoundedRect(bounds, 4))
            using (var brush = new SolidBrush(_accentColor))
                e.Graphics.FillPath(brush, path);

            using (var borderPen = new Pen(AppTheme.Border))
                e.Graphics.DrawPath(borderPen, path);

            if (IsSelected)
            {
                using var pen = new Pen(AppTheme.Accent, 2f);
                e.Graphics.DrawRectangle(pen, 1, 1, Width - 3, Height - 3);
            }
        }

        protected override void OnMouseDown(MouseEventArgs e)
        {
            base.OnMouseDown(e);
            if (e.Button == MouseButtons.Left)
                OnClick(EventArgs.Empty);
        }

        private static System.Drawing.Drawing2D.GraphicsPath CreateRoundedRect(Rectangle bounds, int radius)
        {
            var path = new System.Drawing.Drawing2D.GraphicsPath();
            var diameter = radius * 2;
            path.AddArc(bounds.X, bounds.Y, diameter, diameter, 180, 90);
            path.AddArc(bounds.Right - diameter, bounds.Y, diameter, diameter, 270, 90);
            path.AddArc(bounds.Right - diameter, bounds.Bottom - diameter, diameter, diameter, 0, 90);
            path.AddArc(bounds.X, bounds.Bottom - diameter, diameter, diameter, 90, 90);
            path.CloseFigure();
            return path;
        }
    }
}
