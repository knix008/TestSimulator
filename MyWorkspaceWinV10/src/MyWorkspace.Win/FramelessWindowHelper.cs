using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace MyWorkspace.Win;

internal enum FramelessResizeEdgeKind
{
    Top,
    Bottom,
    Left,
    Right
}

internal sealed class FramelessResizeEdge : Panel
{
    private readonly Form _form;
    private readonly FramelessResizeEdgeKind _kind;

    public FramelessResizeEdge(Form form, FramelessResizeEdgeKind kind)
    {
        _form = form;
        _kind = kind;
        Dock = DockStyle.None;
        TabStop = false;
        BackColor = AppTheme.Sidebar;
        Cursor = FramelessWindowHelper.CursorForKind(kind);

        AppTheme.Changed += OnAppThemeChanged;
        MouseDown += OnMouseDown;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
            AppTheme.Changed -= OnAppThemeChanged;

        base.Dispose(disposing);
    }

    internal void ApplyTheme() =>
        BackColor = AppTheme.Sidebar;

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

        FramelessWindowHelper.BeginResize(_form, FramelessWindowHelper.HitTestForKind(_kind));
    }
}

internal static class FramelessWindowHelper
{
    private const int WmNcLButtonDown = 0x00A1;
    private const int WmGetMinMaxInfo = 0x0024;

    internal const int HtCaption = 2;
    internal const int HtLeft = 10;
    internal const int HtRight = 11;
    internal const int HtTop = 12;
    internal const int HtBottom = 15;

    private const int DwmwaWindowCornerPreference = 33;
    private const int DwmWindowCornerPreferenceDoNotRound = 1;

    public const int ResizeBorder = 8;

    private static readonly ConditionalWeakTable<Form, ResizeEdgeSet> ResizeEdges = new();
    private static readonly ConditionalWeakTable<Form, Control> ShellRoots = new();

    [DllImport("user32.dll")]
    private static extern bool ReleaseCapture();

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, int wParam, int lParam);

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

    public static void Configure(Form form) => Configure(form, shellRoot: null);

    public static void Configure(Form form, Control? shellRoot)
    {
        form.FormBorderStyle = FormBorderStyle.None;
        form.MaximizeBox = true;
        form.MinimizeBox = true;
        form.ShowIcon = true;

        if (shellRoot != null)
            ShellRoots.Add(form, shellRoot);

        void OnReady()
        {
            ApplyDwmSettings(form);
            EnsureResizeEdges(form);
            ApplyShellChrome(form);
            LayoutShellContent(form);
        }

        if (form.IsHandleCreated)
            OnReady();
        else
            form.HandleCreated += (_, _) => OnReady();

        form.Load += (_, _) => LayoutFrame(form);
        form.Resize += (_, _) => LayoutFrame(form);
        form.Shown += (_, _) => ApplyShellChrome(form);

        AppTheme.Changed += OnAppThemeChanged;
        form.FormClosed += OnFormClosed;

        ApplyShellChrome(form);
        LayoutShellContent(form);

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
                    LayoutFrame(form);
                });
            else
            {
                ApplyShellChrome(form);
                LayoutFrame(form);
            }
        }

        void OnFormClosed(object? sender, FormClosedEventArgs e) =>
            AppTheme.Changed -= OnAppThemeChanged;
    }

    public static void ApplyShellChrome(Form form)
    {
        if (form.IsDisposed)
            return;

        form.BackColor = AppTheme.Sidebar;

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

    internal static int HitTestForKind(FramelessResizeEdgeKind kind) => kind switch
    {
        FramelessResizeEdgeKind.Top => HtTop,
        FramelessResizeEdgeKind.Bottom => HtBottom,
        FramelessResizeEdgeKind.Left => HtLeft,
        FramelessResizeEdgeKind.Right => HtRight,
        _ => HtLeft
    };

    internal static Cursor CursorForKind(FramelessResizeEdgeKind kind) => kind switch
    {
        FramelessResizeEdgeKind.Top or FramelessResizeEdgeKind.Bottom => Cursors.SizeNS,
        FramelessResizeEdgeKind.Left or FramelessResizeEdgeKind.Right => Cursors.SizeWE,
        _ => Cursors.Default
    };

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

        var top = new FramelessResizeEdge(form, FramelessResizeEdgeKind.Top);
        var bottom = new FramelessResizeEdge(form, FramelessResizeEdgeKind.Bottom);
        var left = new FramelessResizeEdge(form, FramelessResizeEdgeKind.Left);
        var right = new FramelessResizeEdge(form, FramelessResizeEdgeKind.Right);

        var edgeSet = new ResizeEdgeSet([top, bottom, left, right], top, bottom, left, right);

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
        var innerWidth = Math.Max(0, width - border * 2);
        var innerHeight = Math.Max(0, height - border * 2);

        edgeSet.Top.SetBounds(0, 0, width, border);
        edgeSet.Bottom.SetBounds(border, height - border, innerWidth, border);
        edgeSet.Left.SetBounds(0, border, border, innerHeight);
        edgeSet.Right.SetBounds(width - border, border, border, innerHeight);

        foreach (var edge in edgeSet.All)
            edge.BringToFront();
    }

    private static void LayoutFrame(Form form)
    {
        EnsureResizeEdges(form);
        LayoutShellContent(form);
        LayoutResizeEdges(form);
    }

    private static void LayoutShellContent(Form form)
    {
        if (!ShellRoots.TryGetValue(form, out var shellRoot) || shellRoot.IsDisposed)
            return;

        if (form.ClientSize.Width <= 0 || form.ClientSize.Height <= 0)
            return;

        var border = ResizeBorder;
        var maximized = form.WindowState == FormWindowState.Maximized;

        shellRoot.Margin = Padding.Empty;

        if (maximized)
        {
            shellRoot.Dock = DockStyle.Fill;
            shellRoot.Anchor = AnchorStyles.Top | AnchorStyles.Left;
            return;
        }

        shellRoot.Dock = DockStyle.None;
        shellRoot.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        shellRoot.SetBounds(
            border,
            border,
            Math.Max(0, form.ClientSize.Width - border * 2),
            Math.Max(0, form.ClientSize.Height - border * 2));

        shellRoot.BringToFront();
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
        FramelessResizeEdge right)
    {
        public FramelessResizeEdge[] All { get; } = all;
        public FramelessResizeEdge Top { get; } = top;
        public FramelessResizeEdge Bottom { get; } = bottom;
        public FramelessResizeEdge Left { get; } = left;
        public FramelessResizeEdge Right { get; } = right;
    }
}
