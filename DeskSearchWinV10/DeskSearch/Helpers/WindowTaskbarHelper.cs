using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;

namespace DeskSearch.Helpers;

internal static class WindowTaskbarHelper
{
    private const int GwlExStyle = -20;
    private const int WsExToolWindow = 0x00000080;
    private const int WsExAppWindow = 0x00040000;

    public static void ExcludeFromTaskbar(Window window)
    {
        window.ShowInTaskbar = false;

        if (window.IsLoaded)
            ApplyExStyle(window);
    }

    public static void ApplyExStyle(Window window)
    {
        var hwnd = new WindowInteropHelper(window).Handle;
        if (hwnd == nint.Zero)
            return;

        var style = GetWindowLongPtr(hwnd, GwlExStyle);
        style = (style | WsExToolWindow) & ~WsExAppWindow;
        SetWindowLongPtr(hwnd, GwlExStyle, style);
    }

    [DllImport("user32.dll", EntryPoint = "GetWindowLong")]
    private static extern nint GetWindowLong32(nint hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtr")]
    private static extern nint GetWindowLongPtr64(nint hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "SetWindowLong")]
    private static extern nint SetWindowLong32(nint hWnd, int nIndex, nint dwNewLong);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtr")]
    private static extern nint SetWindowLongPtr64(nint hWnd, int nIndex, nint dwNewLong);

    private static nint GetWindowLongPtr(nint hWnd, int nIndex) =>
        nint.Size == 8 ? GetWindowLongPtr64(hWnd, nIndex) : GetWindowLong32(hWnd, nIndex);

    private static nint SetWindowLongPtr(nint hWnd, int nIndex, nint dwNewLong) =>
        nint.Size == 8 ? SetWindowLongPtr64(hWnd, nIndex, dwNewLong) : SetWindowLong32(hWnd, nIndex, dwNewLong);
}
