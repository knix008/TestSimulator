using System.Runtime.InteropServices;

namespace MemoPadV10;

/// <summary>옅은 회색 계열의 세로 스크롤바(얇은 트랙·썸). 필요할 때만 Visible로 둡니다.</summary>
internal sealed class ThemedVScrollBar : Control
{
    private static readonly Color DefaultTrack = Color.FromArgb(236, 236, 236);
    private static readonly Color DefaultThumb = Color.FromArgb(176, 176, 176);
    private static readonly Color HoverThumb = Color.FromArgb(148, 148, 148);

    private int _value;
    private int _maximum;
    private bool _dragging;
    private int _dragOffsetY;
    private bool _thumbHot;

    public ThemedVScrollBar()
    {
        SetStyle(ControlStyles.UserPaint
            | ControlStyles.AllPaintingInWmPaint
            | ControlStyles.OptimizedDoubleBuffer
            | ControlStyles.ResizeRedraw
            | ControlStyles.Opaque, true);
        Width = 10;
        TabStop = false;
        Cursor = Cursors.Default;
        TrackColor = DefaultTrack;
        ThumbColor = DefaultThumb;
        BackColor = DefaultTrack;
    }

    public Color TrackColor { get; set; }
    public Color ThumbColor { get; set; }

    public int Maximum
    {
        get => _maximum;
        set
        {
            _maximum = Math.Max(0, value);
            if (_value > _maximum)
            {
                SetValueCore(_maximum, raiseEvent: true);
            }

            Invalidate();
        }
    }

    public int Value
    {
        get => _value;
        set => SetValueCore(value, raiseEvent: true);
    }

    public event EventHandler? ValueChanged;

    public void SetValueSilent(int value) => SetValueCore(value, raiseEvent: false);

    private void SetValueCore(int value, bool raiseEvent)
    {
        int clamped = Math.Clamp(value, 0, _maximum);
        if (_value == clamped)
        {
            return;
        }

        _value = clamped;
        Invalidate();
        if (raiseEvent)
        {
            ValueChanged?.Invoke(this, EventArgs.Empty);
        }
    }

    /// <summary>배경색과 무관하게 옅은 회색 팔레트를 유지합니다.</summary>
    public void ApplyTheme(Color background)
    {
        _ = background;
        TrackColor = DefaultTrack;
        ThumbColor = DefaultThumb;
        BackColor = DefaultTrack;
        Invalidate();
    }

    private Rectangle GetThumbRectangle()
    {
        if (_maximum <= 0 || Height <= 0)
        {
            return Rectangle.Empty;
        }

        int track = Math.Max(1, Height);
        int thumbH = Math.Max(24, (int)(track * (track / (float)(track + _maximum))));
        thumbH = Math.Min(thumbH, track);
        float ratio = _value / (float)_maximum;
        int thumbY = (int)((track - thumbH) * ratio);
        return new Rectangle(1, thumbY, Math.Max(1, Width - 2), thumbH);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        using SolidBrush track = new(TrackColor);
        e.Graphics.FillRectangle(track, ClientRectangle);

        Rectangle thumb = GetThumbRectangle();
        if (thumb.IsEmpty)
        {
            return;
        }

        Color thumbColor = _thumbHot || _dragging ? HoverThumb : ThumbColor;
        using SolidBrush thumbBrush = new(thumbColor);
        e.Graphics.FillRectangle(thumbBrush, thumb);
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (e.Button != MouseButtons.Left || _maximum <= 0)
        {
            return;
        }

        Rectangle thumb = GetThumbRectangle();
        if (thumb.Contains(e.Location))
        {
            _dragging = true;
            _dragOffsetY = e.Y - thumb.Y;
            Capture = true;
            return;
        }

        int page = Math.Max(40, Height - 20);
        Value += e.Y < thumb.Y ? -page : page;
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        bool hot = GetThumbRectangle().Contains(e.Location);
        if (hot != _thumbHot)
        {
            _thumbHot = hot;
            Invalidate();
        }

        if (!_dragging || _maximum <= 0)
        {
            return;
        }

        Rectangle thumb = GetThumbRectangle();
        int track = Math.Max(1, Height - thumb.Height);
        int newY = Math.Clamp(e.Y - _dragOffsetY, 0, track);
        Value = track == 0 ? 0 : (int)Math.Round(newY * (_maximum / (float)track));
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        base.OnMouseLeave(e);
        if (_thumbHot)
        {
            _thumbHot = false;
            Invalidate();
        }
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        _dragging = false;
        Capture = false;
    }
}

/// <summary>RichTextBox 시스템 스크롤바를 숨기고 테마 스크롤바와 동기화합니다.</summary>
internal static class RichTextScrollInterop
{
    private const int SbVert = 1;
    private const int WmVscroll = 0x0115;
    private const int SbThumbPosition = 4;
    private const int SifRange = 0x0001;
    private const int SifPage = 0x0002;
    private const int SifPos = 0x0004;
    private const int SifTrackPos = 0x0010;
    private const int SifAll = SifRange | SifPage | SifPos | SifTrackPos;

    [StructLayout(LayoutKind.Sequential)]
    private struct ScrollInfo
    {
        public uint cbSize;
        public uint fMask;
        public int nMin;
        public int nMax;
        public uint nPage;
        public int nPos;
        public int nTrackPos;
    }

    [DllImport("user32.dll")]
    private static extern bool ShowScrollBar(IntPtr hWnd, int wBar, bool bShow);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool GetScrollInfo(IntPtr hwnd, int fnBar, ref ScrollInfo lpsi);

    [DllImport("user32.dll")]
    private static extern int SetScrollInfo(IntPtr hwnd, int fnBar, ref ScrollInfo lpsi, bool fRedraw);

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

    public static void HideVerticalScrollBar(Control control)
    {
        // ShowScrollBar 사용 금지 — RichTextBox 입력/표시가 깨질 수 있음.
        _ = control;
    }

    public static bool TryReadVertical(Control control, out int position, out int maximum)
    {
        position = 0;
        maximum = 0;
        if (!control.IsHandleCreated)
        {
            return false;
        }

        // Vertical 스크롤바가 있으면 GetScrollInfo가 정확합니다.
        ScrollInfo info = new()
        {
            cbSize = (uint)Marshal.SizeOf<ScrollInfo>(),
            fMask = SifAll
        };
        if (GetScrollInfo(control.Handle, SbVert, ref info))
        {
            position = info.nPos;
            int page = (int)Math.Max(1u, info.nPage);
            maximum = Math.Max(0, info.nMax - page + 1);
            if (maximum > 0 || control is not RichTextBox)
            {
                return true;
            }
        }

        // ScrollBars.None 등에서 정보가 없으면 줄 단위로 대체
        if (control is RichTextBox rtb)
        {
            return TryReadVerticalByLine(rtb, out position, out maximum);
        }

        return false;
    }

    private const int EmGetLineCount = 0x00BA;
    private const int EmGetFirstVisibleLine = 0x00CE;
    private const int EmLineScroll = 0x00B6;
    private const int EmSetScrollPos = 0x04DE; // WM_USER + 222

    [StructLayout(LayoutKind.Sequential)]
    private struct PointStruct
    {
        public int X;
        public int Y;
    }

    public static bool TryReadVerticalByLine(RichTextBox rtb, out int firstLine, out int maxScroll)
    {
        firstLine = 0;
        maxScroll = 0;
        if (!rtb.IsHandleCreated)
        {
            return false;
        }

        int lines = (int)SendMessage(rtb.Handle, EmGetLineCount, IntPtr.Zero, IntPtr.Zero);
        firstLine = (int)SendMessage(rtb.Handle, EmGetFirstVisibleLine, IntPtr.Zero, IntPtr.Zero);
        int lineHeight = Math.Max(1, TextRenderer.MeasureText("Ag", rtb.Font).Height);
        int visible = Math.Max(1, rtb.ClientSize.Height / lineHeight);
        maxScroll = Math.Max(0, lines - visible);
        firstLine = Math.Clamp(firstLine, 0, maxScroll);
        return true;
    }

    public static void SetVerticalPosition(Control control, int position)
    {
        if (!control.IsHandleCreated)
        {
            return;
        }

        ScrollInfo info = new()
        {
            cbSize = (uint)Marshal.SizeOf<ScrollInfo>(),
            fMask = SifPos,
            nPos = Math.Max(0, position)
        };
        SetScrollInfo(control.Handle, SbVert, ref info, true);
        IntPtr wParam = (IntPtr)(SbThumbPosition | (position << 16));
        SendMessage(control.Handle, WmVscroll, wParam, IntPtr.Zero);

        if (control is RichTextBox rtb)
        {
            int current = (int)SendMessage(rtb.Handle, EmGetFirstVisibleLine, IntPtr.Zero, IntPtr.Zero);
            // GetScrollInfo 단위와 줄 단위가 다를 수 있어, 줄 기반일 때만 추가 보정
            if (rtb.ScrollBars == RichTextBoxScrollBars.None)
            {
                int delta = position - current;
                if (delta != 0)
                {
                    SendMessage(rtb.Handle, EmLineScroll, IntPtr.Zero, (IntPtr)delta);
                }
            }
        }
    }

    public static void ScrollToTop(RichTextBox rtb)
    {
        if (!rtb.IsHandleCreated)
        {
            return;
        }

        rtb.Select(0, 0);
        rtb.ScrollToCaret();

        PointStruct pt = new() { X = 0, Y = 0 };
        SendMessage(rtb.Handle, EmSetScrollPos, IntPtr.Zero, ref pt);

        int first = (int)SendMessage(rtb.Handle, EmGetFirstVisibleLine, IntPtr.Zero, IntPtr.Zero);
        if (first != 0)
        {
            SendMessage(rtb.Handle, EmLineScroll, IntPtr.Zero, (IntPtr)(-first));
        }

        SetVerticalPosition(rtb, 0);
    }

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, ref PointStruct lParam);

    public static void ScrollLines(RichTextBox rtb, int lineDelta)
    {
        if (!rtb.IsHandleCreated || lineDelta == 0)
        {
            return;
        }

        SendMessage(rtb.Handle, EmLineScroll, IntPtr.Zero, (IntPtr)lineDelta);
    }
}
