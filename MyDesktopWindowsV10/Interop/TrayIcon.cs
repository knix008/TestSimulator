using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Interop;

namespace MyDesktop.Interop;

/// <summary>
/// A notification area icon backed by Shell_NotifyIcon, so the app stays pure WPF.
/// </summary>
internal sealed class TrayIcon : IDisposable
{
    private readonly HwndSource _source;
    private readonly uint _id = 1;
    private IntPtr _icon;
    private bool _added;

    private readonly string _tooltip;

    public TrayIcon(string tooltip, ContextMenu menu)
    {
        Menu = menu;
        _tooltip = tooltip;

        _source = new HwndSource(new HwndSourceParameters("MyDesktopTrayHost")
        {
            Width = 0,
            Height = 0,
            WindowStyle = 0,
            ExtendedWindowStyle = NativeMethods.WS_EX_TOOLWINDOW
        });
        _source.AddHook(WndProc);

        _icon = LoadAppIcon();
        Visible = true;
    }

    public ContextMenu Menu { get; }

    /// <summary>
    /// Adds or removes the notification area icon. The host window stays either way, because it is
    /// what carries the icon's callback messages and rebuilding it would cost more than it saves.
    /// </summary>
    public bool Visible
    {
        get => _added;
        set
        {
            if (_added == value)
            {
                return;
            }

            var data = CreateData();
            if (value)
            {
                data.uFlags = NativeMethods.NIF_ICON | NativeMethods.NIF_MESSAGE | NativeMethods.NIF_TIP;
                data.uCallbackMessage = NativeMethods.WM_TRAYCALLBACK;
                data.hIcon = _icon;
                data.szTip = _tooltip;
                _added = NativeMethods.Shell_NotifyIcon(NativeMethods.NIM_ADD, ref data);
            }
            else
            {
                NativeMethods.Shell_NotifyIcon(NativeMethods.NIM_DELETE, ref data);
                _added = false;
            }
        }
    }

    public event Action? DoubleClicked;

    public void Dispose()
    {
        if (_added)
        {
            var data = CreateData();
            NativeMethods.Shell_NotifyIcon(NativeMethods.NIM_DELETE, ref data);
            _added = false;
        }

        if (_icon != IntPtr.Zero)
        {
            NativeMethods.DestroyIcon(_icon);
            _icon = IntPtr.Zero;
        }

        _source.Dispose();
    }

    private NativeMethods.NOTIFYICONDATA CreateData() => new()
    {
        cbSize = System.Runtime.InteropServices.Marshal.SizeOf<NativeMethods.NOTIFYICONDATA>(),
        hWnd = _source.Handle,
        uID = _id,
        szTip = "",
        szInfo = "",
        szInfoTitle = ""
    };

    private static IntPtr LoadAppIcon()
    {
        var path = Environment.ProcessPath;
        if (!string.IsNullOrEmpty(path) && NativeMethods.ExtractIconEx(path, 0, out var large, out var small, 1) > 0)
        {
            if (small != IntPtr.Zero && large != IntPtr.Zero)
            {
                NativeMethods.DestroyIcon(large);
                return small;
            }

            if (large != IntPtr.Zero)
            {
                return large;
            }
        }

        return NativeMethods.LoadIcon(IntPtr.Zero, new IntPtr(32512));
    }

    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg != NativeMethods.WM_TRAYCALLBACK)
        {
            return IntPtr.Zero;
        }

        switch (lParam.ToInt32())
        {
            case NativeMethods.WM_RBUTTONUP:
            case NativeMethods.WM_LBUTTONUP:
                ShowMenu();
                handled = true;
                break;

            case 0x0203: // WM_LBUTTONDBLCLK
                DoubleClicked?.Invoke();
                handled = true;
                break;
        }

        return IntPtr.Zero;
    }

    private void ShowMenu()
    {
        // The host window is invisible, so give it focus first or the menu will not close on its own.
        NativeMethods.SetForegroundWindow(_source.Handle);

        if (!NativeMethods.GetCursorPos(out var cursor))
        {
            return;
        }

        var transform = _source.CompositionTarget?.TransformFromDevice ?? System.Windows.Media.Matrix.Identity;
        var anchor = transform.Transform(new Point(cursor.X, cursor.Y));
        Menu.Placement = PlacementMode.AbsolutePoint;
        Menu.HorizontalOffset = anchor.X;
        Menu.VerticalOffset = anchor.Y;
        Menu.StaysOpen = false;
        MyDesktop.Views.MenuArt.Show(Menu);
    }
}
