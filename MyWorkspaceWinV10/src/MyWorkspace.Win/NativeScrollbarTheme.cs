using System.Runtime.InteropServices;
using System.Text;

namespace MyWorkspace.Win;

internal enum ScrollbarThemeApplyMode
{
    Full,
    ColorsOnly
}

internal static class NativeScrollbarTheme
{
    private const int WmThemeChanged = 0x031A;
    private const int PreferredAppModeAllowDark = 1;
    private const int PreferredAppModeForceLight = 3;
    private const string ScrollbarThemeClass = "Explorer";
    private const string ScrollbarThemePart = "ScrollBar";

    [DllImport("uxtheme.dll", EntryPoint = "#135")]
    private static extern int SetPreferredAppMode(int preferredAppMode);

    [DllImport("uxtheme.dll", EntryPoint = "#133")]
    private static extern bool AllowDarkModeForWindow(IntPtr hWnd, bool allow);

    [DllImport("uxtheme.dll", EntryPoint = "#104")]
    private static extern void RefreshImmersiveColorPolicyState();

    [DllImport("uxtheme.dll", CharSet = CharSet.Unicode)]
    private static extern int SetWindowTheme(IntPtr hwnd, string pszSubAppName, string? pszSubIdList);

    [DllImport("user32.dll")]
    private static extern bool EnumChildWindows(IntPtr hWndParent, EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    private static bool _initialized;

    public static void Initialize()
    {
        if (_initialized)
            return;

        Comctl32ScrollBarThemeHook.TryInstall();
        _initialized = true;
    }

    public static void SyncApplicationTheme(bool isDark)
    {
        try
        {
            _ = SetPreferredAppMode(isDark ? PreferredAppModeAllowDark : PreferredAppModeForceLight);
        }
        catch (EntryPointNotFoundException)
        {
        }
        catch (DllNotFoundException)
        {
        }

        try
        {
            RefreshImmersiveColorPolicyState();
        }
        catch (EntryPointNotFoundException)
        {
        }
        catch (DllNotFoundException)
        {
        }
    }

    public static void ApplyTreeViewHostTheme(IntPtr treeHandle) =>
        ApplyWindowTheme(treeHandle, ScrollbarThemeApplyMode.ColorsOnly);

    public static void ApplyScrollbarTheme(IntPtr scrollbarHandle, ScrollbarThemeApplyMode mode = ScrollbarThemeApplyMode.Full)
    {
        if (scrollbarHandle == IntPtr.Zero || !IsScrollBarClass(scrollbarHandle))
            return;

        ApplyWindowTheme(scrollbarHandle, mode);
    }

    public static void ApplyTreeViewScrollbars(IntPtr treeHandle, ScrollbarThemeApplyMode mode = ScrollbarThemeApplyMode.Full)
    {
        if (treeHandle == IntPtr.Zero)
            return;

        ApplyTreeViewHostTheme(treeHandle);
        ForEachScrollbar(treeHandle, hwnd => ApplyScrollbarTheme(hwnd, mode));
    }

    public static void ForEachScrollbar(IntPtr treeHandle, Action<IntPtr> action)
    {
        if (treeHandle == IntPtr.Zero)
            return;

        EnumChildWindows(treeHandle, (hWnd, _) =>
        {
            if (IsScrollBarClass(hWnd))
                action(hWnd);
            return true;
        }, IntPtr.Zero);
    }

    public static bool IsScrollBarClass(IntPtr hwnd) =>
        string.Equals(GetWindowClassName(hwnd), "ScrollBar", StringComparison.Ordinal);

    public static bool IsParentNotifyCreate(Message m) =>
        m.Msg == 0x0210 && (m.WParam.ToInt32() & 0xFFFF) == 0x0001;

    private static void ApplyWindowTheme(IntPtr hwnd, ScrollbarThemeApplyMode mode)
    {
        _ = AllowDarkModeForWindow(hwnd, AppTheme.IsDark);

        if (mode == ScrollbarThemeApplyMode.Full)
            SetWindowTheme(hwnd, ScrollbarThemeClass, ScrollbarThemePart);

        SendMessage(hwnd, WmThemeChanged, IntPtr.Zero, IntPtr.Zero);
    }

    private static string GetWindowClassName(IntPtr hWnd)
    {
        var sb = new StringBuilder(256);
        _ = GetClassName(hWnd, sb, sb.Capacity);
        return sb.ToString();
    }
}
