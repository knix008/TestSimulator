using ScreenCamWin.Models;
using ScreenCamWin.Native;
using System.Text;

namespace ScreenCamWin.Core;

public static class WindowEnumerator
{
    public static List<WindowInfo> GetVisibleWindows()
    {
        var list = new List<WindowInfo> { WindowInfo.Desktop };

        NativeMethods.EnumWindows((hWnd, _) =>
        {
            if (!NativeMethods.IsWindowVisible(hWnd)) return true;

            int len = NativeMethods.GetWindowTextLength(hWnd);
            if (len == 0) return true;

            var sb = new StringBuilder(len + 1);
            NativeMethods.GetWindowText(hWnd, sb, sb.Capacity);
            string title = sb.ToString().Trim();

            if (string.IsNullOrEmpty(title) || title == "Program Manager") return true;

            list.Add(new WindowInfo { Handle = hWnd, Title = title });
            return true;
        }, IntPtr.Zero);

        return list;
    }
}
