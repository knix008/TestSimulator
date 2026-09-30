using System.Text;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Threading;

namespace Palisades.Interop;

/// <summary>
/// Locates the shell windows that make up the desktop.
/// </summary>
internal static class DesktopWindows
{
    private static IntPtr _desktop;
    private static IntPtr _wallpaperHost;

    /// <summary>Progman, the window that owns the desktop icon view.</summary>
    public static IntPtr Desktop
    {
        get
        {
            if (_desktop == IntPtr.Zero || !NativeMethods.IsWindowVisible(_desktop))
            {
                _desktop = NativeMethods.GetShellWindow();
                if (_desktop == IntPtr.Zero)
                {
                    _desktop = NativeMethods.FindWindow("Progman", null);
                }
            }

            return _desktop;
        }
    }

    /// <summary>
    /// The WorkerW that paints the wallpaper on Windows 8+, or Progman when there is none.
    /// </summary>
    public static IntPtr WallpaperHost
    {
        get
        {
            if (_wallpaperHost != IntPtr.Zero && NativeMethods.IsWindowVisible(_wallpaperHost))
            {
                return _wallpaperHost;
            }

            var progman = Desktop;
            if (progman == IntPtr.Zero)
            {
                return IntPtr.Zero;
            }

            NativeMethods.SendMessageTimeout(progman, NativeMethods.WM_SPAWN_WORKERW, IntPtr.Zero, IntPtr.Zero,
                NativeMethods.SMTO_ABORTIFHUNG, 1000, out _);

            var found = IntPtr.Zero;
            NativeMethods.EnumWindows((handle, _) =>
            {
                if (NativeMethods.FindWindowEx(handle, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero)
                {
                    var sibling = NativeMethods.FindWindowEx(IntPtr.Zero, handle, "WorkerW", null);
                    if (sibling != IntPtr.Zero)
                    {
                        found = sibling;
                        return false;
                    }
                }

                return true;
            }, IntPtr.Zero);

            _wallpaperHost = found != IntPtr.Zero ? found : progman;
            return _wallpaperHost;
        }
    }

    /// <summary>The window Palisades draws the desktop into, when it is drawing one.</summary>
    public static IntPtr DrawnDesktop { get; set; }

    /// <summary>True when the window under a point belongs to the desktop rather than an app.</summary>
    public static bool IsDesktopSurface(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero)
        {
            return false;
        }

        if (DrawnDesktop != IntPtr.Zero
            && (hwnd == DrawnDesktop || NativeMethods.GetAncestor(hwnd, NativeMethods.GA_ROOT) == DrawnDesktop))
        {
            return true;
        }

        // Both halves have to hold. Accepting any SysListView32 would catch file dialogs and ordinary
        // list controls; accepting anything rooted at Progman would catch other apps' desktop widgets,
        // which parent themselves into WorkerW. Only the shell's own desktop view passes.
        if (ClassNameOf(hwnd) is not ("SysListView32" or "SHELLDLL_DefView" or "Progman" or "WorkerW"))
        {
            return false;
        }

        var root = NativeMethods.GetAncestor(hwnd, NativeMethods.GA_ROOT);
        if (root == IntPtr.Zero)
        {
            root = hwnd;
        }

        return ClassNameOf(root) is "Progman" or "WorkerW";
    }

    public static string ClassNameOf(IntPtr hwnd)
    {
        var buffer = new StringBuilder(256);
        return NativeMethods.GetClassName(hwnd, buffer, buffer.Capacity) > 0 ? buffer.ToString() : "";
    }
}

/// <summary>
/// Keeps a window sitting on the wallpaper: below every application window, above the desktop
/// background, and out of Alt+Tab. Windows puts HWND_BOTTOM below the shell's desktop window, so
/// after sinking the fence we push the desktop one step further down instead.
/// </summary>
internal static class DesktopAnchor
{
    private const uint KeepFlags = NativeMethods.SWP_NOMOVE | NativeMethods.SWP_NOSIZE | NativeMethods.SWP_NOACTIVATE;

    private static readonly List<IntPtr> Anchored = [];
    private static readonly List<IntPtr> Lowest = [];
    private static DispatcherTimer? _watchdog;

    /// <summary>
    /// <paramref name="lowest"/> keeps the window under every other anchored window, which is where
    /// the drawn desktop belongs.
    /// </summary>
    public static void Attach(Window window, bool lowest = false)
    {
        var hwnd = new WindowInteropHelper(window).Handle;
        if (hwnd == IntPtr.Zero)
        {
            return;
        }

        var exStyle = NativeMethods.GetWindowLongAuto(hwnd, NativeMethods.GWL_EXSTYLE).ToInt64();
        exStyle |= NativeMethods.WS_EX_TOOLWINDOW;
        exStyle &= ~(long)NativeMethods.WS_EX_APPWINDOW;
        NativeMethods.SetWindowLongAuto(hwnd, NativeMethods.GWL_EXSTYLE, new IntPtr(exStyle));

        HwndSource.FromHwnd(hwnd)?.AddHook(WndProc);

        var list = lowest ? Lowest : Anchored;
        if (!list.Contains(hwnd))
        {
            list.Add(hwnd);
        }

        window.Closed += (_, _) => list.Remove(hwnd);
        SinkAll();
        StartWatchdog();
    }

    /// <summary>
    /// Each sink drops one window to the very bottom, so the last one sunk ends up lowest. The drawn
    /// desktop therefore goes last.
    /// </summary>
    public static void SinkAll()
    {
        foreach (var hwnd in Anchored.ToArray())
        {
            Sink(hwnd);
        }

        foreach (var hwnd in Lowest.ToArray())
        {
            Sink(hwnd);
        }
    }

    private static void Sink(IntPtr hwnd)
    {
        NativeMethods.SetWindowPos(hwnd, NativeMethods.HWND_BOTTOM, 0, 0, 0, 0, KeepFlags);

        var desktop = DesktopWindows.Desktop;
        if (desktop != IntPtr.Zero && desktop != hwnd)
        {
            NativeMethods.SetWindowPos(desktop, hwnd, 0, 0, 0, 0, KeepFlags);
        }
    }

    private static IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == NativeMethods.WM_WINDOWPOSCHANGING)
        {
            var position = System.Runtime.InteropServices.Marshal.PtrToStructure<NativeMethods.WINDOWPOS>(lParam);
            if (position.hwndInsertAfter != NativeMethods.HWND_BOTTOM)
            {
                position.hwndInsertAfter = NativeMethods.HWND_BOTTOM;
                position.flags &= ~NativeMethods.SWP_NOZORDER;
                System.Runtime.InteropServices.Marshal.StructureToPtr(position, lParam, false);
            }
        }

        return IntPtr.Zero;
    }

    private static void StartWatchdog()
    {
        if (_watchdog is not null)
        {
            return;
        }

        // Explorer restarts and wallpaper changes rebuild the desktop window, which resets the order.
        _watchdog = new DispatcherTimer(DispatcherPriority.Background)
        {
            Interval = TimeSpan.FromSeconds(4)
        };
        _watchdog.Tick += (_, _) => SinkAll();
        _watchdog.Start();
    }
}
