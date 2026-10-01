using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Interop;
using System.Windows.Threading;

namespace MyDesktop.Interop;

/// <summary>
/// A notification area icon backed by Shell_NotifyIcon, so the app stays pure WPF.
/// </summary>
internal sealed class TrayIcon : IDisposable
{
    /// <summary>
    /// How long to keep offering the icon to a shell that is not taking it yet. Starting with
    /// Windows means starting before Explorer on a cold boot, and a slow one can take a while.
    /// </summary>
    private static readonly TimeSpan RetryInterval = TimeSpan.FromSeconds(2);
    private const int RetryLimit = 30;

    private readonly HwndSource _source;
    private readonly uint _id = 1;
    private readonly int _taskbarCreated;
    private IntPtr _icon;
    private bool _added;
    private bool _wanted;
    private DispatcherTimer? _retry;
    private int _attempts;

    private readonly string _tooltip;

    public TrayIcon(string tooltip, ContextMenu menu)
    {
        Menu = menu;
        _tooltip = tooltip;

        // Explorer broadcasts this to every top-level window once its notification area exists,
        // both at sign-in and after it has been restarted. It is the only notice that the icon
        // added before a restart is gone and has to be added again.
        _taskbarCreated = NativeMethods.RegisterWindowMessage("TaskbarCreated");

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
        get => _wanted;
        set
        {
            if (_wanted == value)
            {
                return;
            }

            _wanted = value;
            if (value)
            {
                Add();
            }
            else
            {
                Remove();
            }
        }
    }

    public event Action? DoubleClicked;

    public void Dispose()
    {
        _wanted = false;
        Remove();

        if (_icon != IntPtr.Zero)
        {
            NativeMethods.DestroyIcon(_icon);
            _icon = IntPtr.Zero;
        }

        _source.Dispose();
    }

    /// <summary>
    /// Hands the icon to the shell, and keeps offering it for a while if the shell will not take
    /// it. Shell_NotifyIcon fails outright while the notification area does not exist, which is
    /// exactly what MyDesktop meets when the Run key starts it ahead of Explorer at sign-in.
    /// </summary>
    private void Add()
    {
        var data = CreateData();
        data.uFlags = NativeMethods.NIF_ICON | NativeMethods.NIF_MESSAGE | NativeMethods.NIF_TIP;
        data.uCallbackMessage = NativeMethods.WM_TRAYCALLBACK;
        data.hIcon = _icon;
        data.szTip = _tooltip;

        _added = NativeMethods.Shell_NotifyIcon(NativeMethods.NIM_ADD, ref data);
        if (_added)
        {
            StopRetrying();
            return;
        }

        MyDesktop.Services.Diagnostics.Write(
            $"the shell would not take the tray icon (attempt {_attempts + 1}), trying again in {RetryInterval.TotalSeconds:0}s");
        StartRetrying();
    }

    private void Remove()
    {
        StopRetrying();

        if (_added)
        {
            var data = CreateData();
            NativeMethods.Shell_NotifyIcon(NativeMethods.NIM_DELETE, ref data);
            _added = false;
        }
    }

    private void StartRetrying()
    {
        if (_retry is not null)
        {
            return;
        }

        _retry = new DispatcherTimer(DispatcherPriority.Background) { Interval = RetryInterval };
        _retry.Tick += (_, _) =>
        {
            // Giving up matters: a timer ticking for the life of the process to call an API that
            // has failed thirty times is not going to be the thing that fixes the notification area.
            if (!_wanted || ++_attempts > RetryLimit)
            {
                StopRetrying();
                return;
            }

            Add();
        };
        _retry.Start();
    }

    private void StopRetrying()
    {
        _retry?.Stop();
        _retry = null;
        _attempts = 0;
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
        if (msg == _taskbarCreated && _taskbarCreated != 0)
        {
            // Whatever we added before is gone with the old Explorer, so this starts from nothing
            // rather than from what we last believed the notification area was showing.
            _added = false;
            if (_wanted)
            {
                Add();
            }

            return IntPtr.Zero;
        }

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
