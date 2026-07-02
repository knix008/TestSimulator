using System.Runtime.InteropServices;
using System.Text;

namespace MyWorkspace.Win;

internal static class TreeViewScrollBarHelper
{
    private const int GwlStyle = -16;
    private const int SbsVert = 0x0001;
    private const int SbHorz = 0;
    private const int SwHide = 0;
    internal const int TvsNoHscroll = 0x8000;
    internal const int WmHscroll = 0x0114;

    public static bool ShouldSuppressMessage(int msg) => msg == WmHscroll;

    [DllImport("user32.dll")]
    private static extern bool ShowScrollBar(IntPtr hWnd, int wBar, bool bShow);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll", EntryPoint = "GetWindowLong")]
    private static extern int GetWindowLong32(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtr")]
    private static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll")]
    private static extern bool EnumChildWindows(IntPtr hWndParent, EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    public static void SuppressHorizontalScrollbars(IntPtr treeHandle)
    {
        if (treeHandle == IntPtr.Zero)
            return;

        ShowScrollBar(treeHandle, SbHorz, false);

        EnumChildWindows(treeHandle, (hWnd, _) =>
        {
            if (IsHorizontalScrollBar(hWnd))
                ShowWindow(hWnd, SwHide);
            return true;
        }, IntPtr.Zero);
    }

    public static bool IsHorizontalScrollBar(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero || !IsScrollBarClass(hwnd))
            return false;

        return (GetWindowStyle(hwnd) & SbsVert) == 0;
    }

    public static bool IsVerticalScrollBar(IntPtr hwnd) =>
        hwnd != IntPtr.Zero && IsScrollBarClass(hwnd) && (GetWindowStyle(hwnd) & SbsVert) != 0;

    private static bool IsScrollBarClass(IntPtr hwnd) =>
        string.Equals(GetWindowClassName(hwnd), "ScrollBar", StringComparison.Ordinal);

    private static int GetWindowStyle(IntPtr hwnd) =>
        IntPtr.Size == 8
            ? (int)(GetWindowLongPtr64(hwnd, GwlStyle) & 0xFFFFFFFF)
            : GetWindowLong32(hwnd, GwlStyle);

    private static string GetWindowClassName(IntPtr hWnd)
    {
        var sb = new StringBuilder(256);
        _ = GetClassName(hWnd, sb, sb.Capacity);
        return sb.ToString();
    }
}
