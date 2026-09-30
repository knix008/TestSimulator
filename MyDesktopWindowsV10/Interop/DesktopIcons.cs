namespace MyDesktop.Interop;

/// <summary>
/// Shows or hides the shell's own desktop icons, exactly as Explorer's
/// "View ▸ Show desktop icons" menu item does. Nothing about the icons themselves is touched, so the
/// switch is reversible and icon positions survive.
/// </summary>
internal static class DesktopIcons
{
    private const uint WM_COMMAND = 0x0111;
    private const int ToggleDesktopIcons = 0x7402;

    private static bool? _stateBeforeMyDesktop;

    public static bool? AreVisible()
    {
        var view = FindDefView();
        if (view == IntPtr.Zero)
        {
            return null;
        }

        // Explorer destroys the icon view outright when the icons are switched off, so a missing
        // list means hidden rather than unknown.
        var list = NativeMethods.FindWindowEx(view, IntPtr.Zero, "SysListView32", null);
        return list != IntPtr.Zero && NativeMethods.IsWindowVisible(list);
    }

    public static void Apply(bool hidden)
    {
        var visible = AreVisible();
        if (visible is null)
        {
            return;
        }

        _stateBeforeMyDesktop ??= visible;

        if (visible == !hidden)
        {
            return;
        }

        Toggle();
    }

    /// <summary>Puts the icons back the way they were before MyDesktop started.</summary>
    public static void Restore()
    {
        if (_stateBeforeMyDesktop is not { } original)
        {
            return;
        }

        if (AreVisible() is { } visible && visible != original)
        {
            Toggle();
        }

        _stateBeforeMyDesktop = null;
    }

    private static void Toggle()
    {
        var view = FindDefView();
        if (view != IntPtr.Zero)
        {
            // Explorer owns this window, so a plain SendMessage would hang MyDesktop for as long as
            // the shell is busy. The timeout keeps a slow shell from taking the app down with it.
            NativeMethods.SendMessageTimeout(view, WM_COMMAND, new IntPtr(ToggleDesktopIcons), IntPtr.Zero,
                NativeMethods.SMTO_ABORTIFHUNG, 3000, out _);
        }
    }

    private static IntPtr FindDefView()
    {
        var view = NativeMethods.FindWindowEx(DesktopWindows.Desktop, IntPtr.Zero, "SHELLDLL_DefView", null);
        if (view != IntPtr.Zero)
        {
            return view;
        }

        // On Windows 8 and later the icon view sometimes sits under a WorkerW instead.
        var found = IntPtr.Zero;
        NativeMethods.EnumWindows((handle, _) =>
        {
            var candidate = NativeMethods.FindWindowEx(handle, IntPtr.Zero, "SHELLDLL_DefView", null);
            if (candidate == IntPtr.Zero)
            {
                return true;
            }

            found = candidate;
            return false;
        }, IntPtr.Zero);

        return found;
    }
}
