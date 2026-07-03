using System.ComponentModel;
using System.Runtime.InteropServices;

namespace MyWorkspace.Win;

/// <summary>
/// Single-line text field with the edit control vertically centered in its client area.
/// </summary>
internal sealed class CenteredSingleLineTextBox : Panel
{
    private const int EmSetmargins = 0x00D3;
    private const int EcLeftmargin = 0x0001;
    private const int EcRightmargin = 0x0002;

    private readonly TextBox _inner = new();

    public CenteredSingleLineTextBox()
    {
        TabStop = false;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);

        _inner.BorderStyle = BorderStyle.None;
        _inner.TabStop = true;
        _inner.Multiline = false;
        _inner.WordWrap = false;
        _inner.AutoSize = false;
        _inner.ImeMode = ImeMode.NoControl;
        ImeMode = ImeMode.NoControl;
        _inner.Anchor = AnchorStyles.Left | AnchorStyles.Top | AnchorStyles.Right;
        _inner.HandleCreated += (_, _) =>
        {
            ClearInnerMargins();
            LayoutInnerTextBox();
        };
        _inner.FontChanged += (_, _) => LayoutInnerTextBox();
        _inner.TextChanged += (_, _) => TextChanged?.Invoke(this, EventArgs.Empty);
        _inner.KeyDown += (_, e) => KeyDown?.Invoke(this, e);
        _inner.GotFocus += (_, _) => GotFocus?.Invoke(this, EventArgs.Empty);

        Controls.Add(_inner);
    }

    public new event EventHandler? TextChanged;
    public new event KeyEventHandler? KeyDown;
    public new event EventHandler? GotFocus;

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public new string Text
    {
        get => _inner.Text;
        set => _inner.Text = value;
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public string PlaceholderText
    {
        get => _inner.PlaceholderText;
        set => _inner.PlaceholderText = value ?? string.Empty;
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public new Font Font
    {
        get => _inner.Font;
        set => _inner.Font = value;
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public new Color ForeColor
    {
        get => _inner.ForeColor;
        set
        {
            base.ForeColor = value;
            _inner.ForeColor = value;
        }
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public new Color BackColor
    {
        get => base.BackColor;
        set
        {
            base.BackColor = value;
            _inner.BackColor = value;
        }
    }

    public new void Focus() => _inner.Focus();

    public new void Select() => _inner.Select();

    public void ClearText() => _inner.Clear();

    protected override void OnLayout(LayoutEventArgs levent)
    {
        base.OnLayout(levent);
        LayoutInnerTextBox();
    }

    protected override void OnFontChanged(EventArgs e)
    {
        base.OnFontChanged(e);
        LayoutInnerTextBox();
    }

    protected override void OnResize(EventArgs eventargs)
    {
        base.OnResize(eventargs);
        LayoutInnerTextBox();
    }

    protected override void OnEnabledChanged(EventArgs e)
    {
        base.OnEnabledChanged(e);
        _inner.Enabled = Enabled;
    }

    protected override void WndProc(ref Message m)
    {
        const int wmEraseBkgnd = 0x0014;
        if (m.Msg == wmEraseBkgnd)
            return;

        base.WndProc(ref m);
    }

    private void LayoutInnerTextBox()
    {
        var width = ClientSize.Width;
        var height = ClientSize.Height;
        if (width <= 0 || height <= 0)
            return;

        var boxHeight = GetInnerLineHeight();
        var top = Math.Max(0, (height - boxHeight) / 2);

        var bounds = new Rectangle(0, top, width, boxHeight);
        if (_inner.Bounds != bounds)
            _inner.Bounds = bounds;

        ClearInnerMargins();
    }

    private int GetInnerLineHeight()
    {
        var font = _inner.Font ?? Font ?? AppTheme.UiFont;
        var measured = TextRenderer.MeasureText(
            "가Ay",
            font,
            Size.Empty,
            TextFormatFlags.NoPadding | TextFormatFlags.SingleLine).Height;
        var textLine = Math.Max(measured, (int)Math.Ceiling(font.GetHeight()));
        var target = textLine + 2;

        if (_inner.IsHandleCreated)
            target = Math.Min(target, _inner.PreferredHeight);

        return Math.Min(ClientSize.Height, target);
    }

    private void ClearInnerMargins()
    {
        if (!_inner.IsHandleCreated)
            return;

        SendMessage(_inner.Handle, EmSetmargins, EcLeftmargin | EcRightmargin, 0);
    }

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, int wParam, int lParam);
}
