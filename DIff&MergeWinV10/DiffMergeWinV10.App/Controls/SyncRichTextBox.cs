using System.Runtime.InteropServices;

namespace DiffMergeWinV10.App.Controls;

/// <summary>
/// A read-only RichTextBox that keeps its vertical scroll position in lockstep with a
/// set of partner controls (used to scroll Base/Local/Remote panes together) and paints
/// full-width row backgrounds behind the text.
/// </summary>
public sealed class SyncRichTextBox : RichTextBox
{
    private const int WM_ERASEBKGND = 0x0014;
    private const int WM_HSCROLL = 0x0114;
    private const int WM_VSCROLL = 0x0115;
    private const int WM_MOUSEWHEEL = 0x020A;
    private const int EM_GETFIRSTVISIBLELINE = 0x00CE;
    private const int EM_LINESCROLL = 0x00B6;
    private const int SB_TOP = 6;
    private const int SB_LEFT = 6;

    private readonly List<Color> _lineColors = new();
    private bool _suppressSync;

    public List<SyncRichTextBox> Partners { get; } = new();

    public event EventHandler? Scrolled;

    public IReadOnlyList<Color> LineColors => _lineColors;

    public SyncRichTextBox()
    {
        ScrollBars = RichTextBoxScrollBars.Vertical;
        HideSelection = false;
    }

    public void ClearContent()
    {
        _lineColors.Clear();
        Clear();
    }

    public void AddLineBackground(Color color) => _lineColors.Add(color);

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WM_ERASEBKGND)
        {
            using var graphics = Graphics.FromHdc(m.WParam);
            PaintRowBackgrounds(graphics);
            m.Result = (IntPtr)1;
            return;
        }

        base.WndProc(ref m);

        if (!_suppressSync && (m.Msg == WM_VSCROLL || m.Msg == WM_MOUSEWHEEL))
        {
            Scrolled?.Invoke(this, EventArgs.Empty);
            SyncPartners();
            Invalidate();
        }
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        Invalidate();
    }

    protected override void OnFontChanged(EventArgs e)
    {
        base.OnFontChanged(e);
        Invalidate();
    }

    private void PaintRowBackgrounds(Graphics graphics)
    {
        var bounds = ClientRectangle;
        if (bounds.Width <= 0 || bounds.Height <= 0)
        {
            return;
        }

        graphics.SetClip(bounds);

        if (_lineColors.Count == 0 || !IsHandleCreated)
        {
            using var fallback = new SolidBrush(BackColor);
            graphics.FillRectangle(fallback, bounds);
            return;
        }

        int lineHeight = Math.Max(1, TextRenderer.MeasureText("Ag", Font).Height);
        string[] lines = Lines;
        int paintedThrough = 0;

        for (int line = 0; line < lines.Length; line++)
        {
            int start = GetFirstCharIndexFromLine(line);
            if (start < 0)
            {
                continue;
            }

            var topLeft = GetPositionFromCharIndex(start);
            if (topLeft.Y >= bounds.Bottom)
            {
                break;
            }

            int height = lineHeight;
            if (line + 1 < lines.Length)
            {
                int nextStart = GetFirstCharIndexFromLine(line + 1);
                if (nextStart >= 0)
                {
                    int nextY = GetPositionFromCharIndex(nextStart).Y;
                    if (nextY > topLeft.Y)
                    {
                        height = nextY - topLeft.Y;
                    }
                }
            }

            Color color = line < _lineColors.Count ? _lineColors[line] : PaneTheme.ZebraForLine(line);
            using var brush = new SolidBrush(color);
            graphics.FillRectangle(brush, 0, topLeft.Y, bounds.Width, height);
            paintedThrough = topLeft.Y + height;
        }

        if (paintedThrough < bounds.Bottom)
        {
            int lineIndex = Math.Max(lines.Length, _lineColors.Count);
            for (int y = paintedThrough; y < bounds.Bottom; y += lineHeight)
            {
                using var brush = new SolidBrush(PaneTheme.ZebraForLine(lineIndex++));
                graphics.FillRectangle(brush, 0, y, bounds.Width, Math.Min(lineHeight, bounds.Bottom - y));
            }
        }
    }

    /// <summary>
    /// Forces the native control all the way to the top-left, bypassing
    /// RichTextBox.ScrollToCaret's "already visible" no-op check.
    /// </summary>
    public void ScrollToTopLeft()
    {
        Select(0, 0);
        SendMessage(Handle, WM_VSCROLL, (IntPtr)SB_TOP, IntPtr.Zero);
        SendMessage(Handle, WM_HSCROLL, (IntPtr)SB_LEFT, IntPtr.Zero);
    }

    public void SyncPartners()
    {
        int myFirstLine = (int)SendMessage(Handle, EM_GETFIRSTVISIBLELINE, IntPtr.Zero, IntPtr.Zero);
        foreach (var partner in Partners)
        {
            if (!partner.IsHandleCreated)
            {
                continue;
            }
            int partnerFirstLine = (int)SendMessage(partner.Handle, EM_GETFIRSTVISIBLELINE, IntPtr.Zero, IntPtr.Zero);
            int delta = myFirstLine - partnerFirstLine;
            if (delta != 0)
            {
                partner._suppressSync = true;
                SendMessage(partner.Handle, EM_LINESCROLL, IntPtr.Zero, (IntPtr)delta);
                partner._suppressSync = false;
                partner.Invalidate();
                partner.Scrolled?.Invoke(partner, EventArgs.Empty);
            }
        }
    }
}
