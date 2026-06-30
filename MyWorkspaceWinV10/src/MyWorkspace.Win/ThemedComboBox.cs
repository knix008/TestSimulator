using System.Runtime.InteropServices;

namespace MyWorkspace.Win;

internal sealed class ThemedComboBox : ComboBox
{
    private const int WmCtlColorListBox = 0x0134;

    private static IntPtr _dropdownBrush = IntPtr.Zero;
    private static Color _dropdownBrushColor = Color.Empty;

    public ThemedComboBox()
    {
        DrawMode = DrawMode.OwnerDrawFixed;
        FlatStyle = FlatStyle.Flat;
        DrawItem += OnDrawItem;
        HandleCreated += (_, _) => ApplyTheme();
        AppTheme.Changed += OnThemeChanged;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
            AppTheme.Changed -= OnThemeChanged;

        base.Dispose(disposing);
    }

    protected override void OnFontChanged(EventArgs e)
    {
        base.OnFontChanged(e);
        ItemHeight = Math.Max(22, Font.Height + 8);
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WmCtlColorListBox)
        {
            SetTextColor(m.WParam, ColorTranslator.ToWin32(AppTheme.TextPrimary));
            SetBkColor(m.WParam, ColorTranslator.ToWin32(AppTheme.Surface));
            m.Result = GetDropdownBrush();
            return;
        }

        base.WndProc(ref m);
    }

    public void ApplyTheme()
    {
        BackColor = AppTheme.Surface;
        ForeColor = AppTheme.TextPrimary;
        Font = AppTheme.CloneUiFont();
        ItemHeight = Math.Max(22, Font.Height + 8);

        AppTheme.AttachComboBoxBorder(this);
        Invalidate();
    }

    private void OnThemeChanged()
    {
        if (IsDisposed)
            return;

        if (InvokeRequired)
        {
            BeginInvoke(ApplyTheme);
            return;
        }

        ApplyTheme();
    }

    private static void OnDrawItem(object? sender, DrawItemEventArgs e)
    {
        if (sender is not ThemedComboBox comboBox || e.Index < 0)
            return;

        var selected = (e.State & DrawItemState.Selected) != 0;
        var background = selected ? AppTheme.AccentHover : AppTheme.Surface;
        var foreground = AppTheme.TextPrimary;

        using (var backgroundBrush = new SolidBrush(background))
            e.Graphics.FillRectangle(backgroundBrush, e.Bounds);

        var text = comboBox.GetItemText(e.Index);
        var font = e.Font ?? comboBox.Font;
        var textBounds = new Rectangle(e.Bounds.X + 4, e.Bounds.Y, e.Bounds.Width - 8, e.Bounds.Height);
        TextRenderer.DrawText(
            e.Graphics,
            text,
            font,
            textBounds,
            foreground,
            TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
    }

    private string GetItemText(int index)
    {
        if (index < 0 || index >= Items.Count)
            return string.Empty;

        var item = Items[index];
        if (item == null)
            return string.Empty;

        if (!string.IsNullOrWhiteSpace(DisplayMember))
        {
            var property = item.GetType().GetProperty(DisplayMember);
            if (property?.GetValue(item) is { } value)
                return value.ToString() ?? string.Empty;
        }

        return item.ToString() ?? string.Empty;
    }

    private static IntPtr GetDropdownBrush()
    {
        if (_dropdownBrush == IntPtr.Zero || _dropdownBrushColor != AppTheme.Surface)
        {
            if (_dropdownBrush != IntPtr.Zero)
                DeleteObject(_dropdownBrush);

            _dropdownBrushColor = AppTheme.Surface;
            _dropdownBrush = CreateSolidBrush(ColorTranslator.ToWin32(_dropdownBrushColor));
        }

        return _dropdownBrush;
    }

    [DllImport("gdi32.dll", EntryPoint = "CreateSolidBrush")]
    private static extern IntPtr CreateSolidBrush(int color);

    [DllImport("gdi32.dll")]
    private static extern bool DeleteObject(IntPtr hObject);

    [DllImport("gdi32.dll")]
    private static extern int SetBkColor(IntPtr hdc, int color);

    [DllImport("gdi32.dll")]
    private static extern int SetTextColor(IntPtr hdc, int color);
}
