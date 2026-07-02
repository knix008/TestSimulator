using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace MyWorkspace.Win;

internal sealed class FramelessResizeEdge : Panel
{
    private readonly Form _form;
    private readonly int _hitTest;

    public FramelessResizeEdge(Form form, int hitTest)
    {
        _form = form;
        _hitTest = hitTest;
        Dock = DockStyle.None;
        TabStop = false;
        BackColor = AppTheme.Background;
        Cursor = hitTest switch
        {
            FramelessWindowHelper.HtLeft or FramelessWindowHelper.HtRight => Cursors.SizeWE,
            FramelessWindowHelper.HtTop or FramelessWindowHelper.HtBottom => Cursors.SizeNS,
            FramelessWindowHelper.HtTopLeft or FramelessWindowHelper.HtBottomRight => Cursors.SizeNWSE,
            FramelessWindowHelper.HtTopRight or FramelessWindowHelper.HtBottomLeft => Cursors.SizeNESW,
            _ => Cursors.Default
        };

        AppTheme.Changed += OnAppThemeChanged;
        MouseDown += OnMouseDown;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
            AppTheme.Changed -= OnAppThemeChanged;

        base.Dispose(disposing);
    }

    internal void ApplyTheme() => BackColor = AppTheme.Background;

    private void OnAppThemeChanged()
    {
        if (IsDisposed)
            return;

        if (InvokeRequired)
            BeginInvoke(ApplyTheme);
        else
            ApplyTheme();
    }

    private void OnMouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left || _form.IsDisposed || !_form.IsHandleCreated)
            return;

        if (_form.WindowState == FormWindowState.Maximized)
            return;

        FramelessWindowHelper.BeginResize(_form, _hitTest);
    }
}

internal static class FramelessWindowHelper
{
    private const int WmNcLButtonDown = 0x00A1;
    private const int WmGetMinMaxInfo = 0x0024;

    internal const int HtClient = 1;
    internal const int HtCaption = 2;
    internal const int HtLeft = 10;
    internal const int HtRight = 11;
    internal const int HtTop = 12;
    internal const int HtTopLeft = 13;
    internal const int HtTopRight = 14;
    internal const int HtBottom = 15;
    internal const int HtBottomLeft = 16;
    internal const int HtBottomRight = 17;

    private const int DwmwaWindowCornerPreference = 33;
    private const int DwmWindowCornerPreferenceDoNotRound = 1;

    public const int ResizeBorder = 8;

    private static readonly ConditionalWeakTable<Form, ResizeEdgeSet> ResizeEdges = new();

    [DllImport("user32.dll")]
    private static extern bool ReleaseCapture();

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, int wParam, int lParam);

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

    public static void Configure(Form form)
    {
        form.FormBorderStyle = FormBorderStyle.None;
        form.MaximizeBox = true;
        form.MinimizeBox = true;
        form.ShowIcon = true;

        void OnReady()
        {
            ApplyDwmSettings(form);
            EnsureResizeEdges(form);
            ApplyShellChrome(form);
        }

        if (form.IsHandleCreated)
            OnReady();
        else
            form.HandleCreated += (_, _) => OnReady();

        form.Load += (_, _) => EnsureResizeEdges(form);
        form.Resize += (_, _) => LayoutResizeEdges(form);
        form.Shown += (_, _) => ApplyShellChrome(form);

        AppTheme.Changed += OnAppThemeChanged;
        form.FormClosed += OnFormClosed;

        ApplyShellChrome(form);

        void OnAppThemeChanged()
        {
            if (form.IsDisposed)
            {
                AppTheme.Changed -= OnAppThemeChanged;
                return;
            }

            if (form.InvokeRequired)
                form.BeginInvoke(() =>
                {
                    ApplyShellChrome(form);
                    LayoutResizeEdges(form);
                });
            else
            {
                ApplyShellChrome(form);
                LayoutResizeEdges(form);
            }
        }

        void OnFormClosed(object? sender, FormClosedEventArgs e) =>
            AppTheme.Changed -= OnAppThemeChanged;
    }

    public static void ApplyShellChrome(Form form)
    {
        if (form.IsDisposed)
            return;

        form.BackColor = AppTheme.Background;

        if (ResizeEdges.TryGetValue(form, out var edgeSet))
        {
            foreach (var edge in edgeSet.All)
                edge.ApplyTheme();
        }
    }

    public static void BeginDrag(Form form) => BeginResize(form, HtCaption);

    public static void BeginResize(Form form, int hitTest)
    {
        if (!form.IsHandleCreated)
            return;

        ReleaseCapture();
        SendMessage(form.Handle, WmNcLButtonDown, hitTest, 0);
    }

    public static bool TryHandleWndProc(Form form, ref Message m)
    {
        if (m.Msg == WmGetMinMaxInfo && form.WindowState == FormWindowState.Maximized)
            AdjustMaximizedClientArea(form, m);

        return false;
    }

    private static void EnsureResizeEdges(Form form)
    {
        if (form.IsDisposed)
            return;

        if (ResizeEdges.TryGetValue(form, out var existing))
        {
            foreach (var edge in existing.All)
                edge.ApplyTheme();
            LayoutResizeEdges(form);
            return;
        }

        var top = new FramelessResizeEdge(form, HtTop);
        var bottom = new FramelessResizeEdge(form, HtBottom);
        var left = new FramelessResizeEdge(form, HtLeft);
        var right = new FramelessResizeEdge(form, HtRight);
        var topLeft = new FramelessResizeEdge(form, HtTopLeft);
        var topRight = new FramelessResizeEdge(form, HtTopRight);
        var bottomLeft = new FramelessResizeEdge(form, HtBottomLeft);
        var bottomRight = new FramelessResizeEdge(form, HtBottomRight);

        var edgeSet = new ResizeEdgeSet(
            [top, bottom, left, right, topLeft, topRight, bottomLeft, bottomRight],
            top, bottom, left, right,
            topLeft, topRight, bottomLeft, bottomRight);

        foreach (var edge in edgeSet.All)
            form.Controls.Add(edge);

        ResizeEdges.Add(form, edgeSet);
        LayoutResizeEdges(form);
    }

    private static void LayoutResizeEdges(Form form)
    {
        if (!ResizeEdges.TryGetValue(form, out var edgeSet))
            return;

        if (form.ClientSize.Width <= 0 || form.ClientSize.Height <= 0)
            return;

        var visible = form.WindowState != FormWindowState.Maximized;
        foreach (var edge in edgeSet.All)
            edge.Visible = visible;

        if (!visible)
            return;

        var border = ResizeBorder;
        var width = form.ClientSize.Width;
        var height = form.ClientSize.Height;
        var innerHeight = Math.Max(0, height - border * 2);

        edgeSet.Top.SetBounds(0, 0, width, border);
        edgeSet.Bottom.SetBounds(0, height - border, width, border);
        edgeSet.Left.SetBounds(0, border, border, innerHeight);
        edgeSet.Right.SetBounds(width - border, border, border, innerHeight);

        edgeSet.TopLeft.SetBounds(0, 0, border, border);
        edgeSet.TopRight.SetBounds(width - border, 0, border, border);
        edgeSet.BottomLeft.SetBounds(0, height - border, border, border);
        edgeSet.BottomRight.SetBounds(width - border, height - border, border, border);

        foreach (var edge in edgeSet.All)
            edge.BringToFront();
    }

    private static void ApplyDwmSettings(Form form)
    {
        var preference = DwmWindowCornerPreferenceDoNotRound;
        _ = DwmSetWindowAttribute(form.Handle, DwmwaWindowCornerPreference, ref preference, sizeof(int));
    }

    private static void AdjustMaximizedClientArea(Form form, Message m)
    {
        var screen = Screen.FromHandle(form.Handle);
        var workArea = screen.WorkingArea;
        var minMaxInfo = Marshal.PtrToStructure<MinMaxInfo>(m.LParam);
        minMaxInfo.ptMaxPosition.X = workArea.Left;
        minMaxInfo.ptMaxPosition.Y = workArea.Top;
        minMaxInfo.ptMaxSize.X = workArea.Width;
        minMaxInfo.ptMaxSize.Y = workArea.Height;
        Marshal.StructureToPtr(minMaxInfo, m.LParam, false);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MinMaxInfo
    {
        public Point ptReserved;
        public Point ptMaxSize;
        public Point ptMaxPosition;
        public Point ptMinTrackSize;
        public Point ptMaxTrackSize;
    }

    private sealed class ResizeEdgeSet(
        FramelessResizeEdge[] all,
        FramelessResizeEdge top,
        FramelessResizeEdge bottom,
        FramelessResizeEdge left,
        FramelessResizeEdge right,
        FramelessResizeEdge topLeft,
        FramelessResizeEdge topRight,
        FramelessResizeEdge bottomLeft,
        FramelessResizeEdge bottomRight)
    {
        public FramelessResizeEdge[] All { get; } = all;
        public FramelessResizeEdge Top { get; } = top;
        public FramelessResizeEdge Bottom { get; } = bottom;
        public FramelessResizeEdge Left { get; } = left;
        public FramelessResizeEdge Right { get; } = right;
        public FramelessResizeEdge TopLeft { get; } = topLeft;
        public FramelessResizeEdge TopRight { get; } = topRight;
        public FramelessResizeEdge BottomLeft { get; } = bottomLeft;
        public FramelessResizeEdge BottomRight { get; } = bottomRight;
    }
}
