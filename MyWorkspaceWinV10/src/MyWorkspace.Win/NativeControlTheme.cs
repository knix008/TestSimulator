using System.Runtime.InteropServices;
using System.Text;

namespace MyWorkspace.Win;

internal static class NativeControlTheme
{
    private const int WmThemeChanged = 0x031A;
    private const int WmCreate = 0x0001;
    private const int WmParentNotify = 0x0210;

    [DllImport("uxtheme.dll", CharSet = CharSet.Unicode)]
    private static extern int SetWindowTheme(IntPtr hwnd, string? pszSubAppName, string? pszSubIdList);

    [DllImport("user32.dll")]
    private static extern bool EnumChildWindows(IntPtr hWndParent, EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    public static void ApplyTreeViewTheme(Control tree)
    {
        if (!tree.IsHandleCreated)
            return;

        ApplyTreeViewTheme(tree.Handle);
    }

    public static void ApplyTreeViewTheme(IntPtr treeHandle)
    {
        if (treeHandle == IntPtr.Zero)
            return;

        if (AppTheme.IsDark)
            SetWindowTheme(treeHandle, "DarkMode_Explorer", "TreeView");
        else
            SetWindowTheme(treeHandle, "Explorer", null);

        ThemeScrollBars(treeHandle);
        SendMessage(treeHandle, WmThemeChanged, IntPtr.Zero, IntPtr.Zero);
    }

    public static void ApplyScrollbarTheme(IntPtr scrollbarHandle)
    {
        if (scrollbarHandle == IntPtr.Zero || !IsScrollBarClass(scrollbarHandle))
            return;

        if (AppTheme.IsDark)
            SetWindowTheme(scrollbarHandle, "DarkMode_Explorer", "ScrollBar");
        else
            SetWindowTheme(scrollbarHandle, "Explorer", "ScrollBar");

        SendMessage(scrollbarHandle, WmThemeChanged, IntPtr.Zero, IntPtr.Zero);
    }

    public static bool IsScrollBarClass(IntPtr hwnd) =>
        string.Equals(GetWindowClassName(hwnd), "ScrollBar", StringComparison.Ordinal);

    public static bool IsParentNotifyCreate(Message m) =>
        m.Msg == WmParentNotify && (m.WParam.ToInt32() & 0xFFFF) == WmCreate;

    private static void ThemeScrollBars(IntPtr parentHandle)
    {
        EnumChildWindows(parentHandle, (hWnd, _) =>
        {
            ApplyScrollbarTheme(hWnd);
            return true;
        }, IntPtr.Zero);
    }

    private static string GetWindowClassName(IntPtr hWnd)
    {
        var sb = new StringBuilder(256);
        _ = GetClassName(hWnd, sb, sb.Capacity);
        return sb.ToString();
    }
}
