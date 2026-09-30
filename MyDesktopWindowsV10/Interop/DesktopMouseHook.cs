using System.Windows;
using System.Windows.Threading;

namespace Palisades.Interop;

/// <summary>
/// Watches the mouse for the two gestures Fences puts on the bare desktop: right-drag a rectangle
/// to create a fence, and double-click to hide or restore every fence.
/// </summary>
internal sealed class DesktopMouseHook : IDisposable
{
    /// <summary>
    /// Rides along on the clicks Palisades replays, so the hook can recognise its own injection and
    /// wave it through instead of arming a second gesture on it.
    /// </summary>
    private static readonly IntPtr ReplayTag = new(0x50414C49);

    private static readonly IntPtr Swallow = new(1);

    private readonly NativeMethods.HookProc _callback;
    private readonly Dispatcher _dispatcher;
    private IntPtr _hook;

    private bool _armed;
    private bool _lassoing;
    private NativeMethods.POINT _origin;
    private NativeMethods.POINT _current;
    private bool _bandQueued;
    private NativeMethods.POINT _lastClick;
    private uint _lastClickTime;

    public DesktopMouseHook()
    {
        _callback = OnMouseEvent;
        _dispatcher = Dispatcher.CurrentDispatcher;
    }

    public bool LassoEnabled { get; set; } = true;

    public bool QuickHideEnabled { get; set; } = true;

    /// <summary>
    /// Answers whether a screen point sits on one of the icons Palisades draws. Clicking an icon is
    /// not a desktop gesture, so neither the rubber band nor the quick hide should fire there.
    /// </summary>
    public Func<Point, bool>? IsOverDrawnIcon { get; set; }

    /// <summary>Screen pixels, raised once the right-drag passes the drag threshold.</summary>
    public event Action<Point, Point>? LassoUpdated;

    public event Action<Point, Point>? LassoCompleted;

    public event Action? DesktopDoubleClicked;

    public bool IsInstalled => _hook != IntPtr.Zero;

    public void Install()
    {
        if (_hook != IntPtr.Zero)
        {
            return;
        }

        // A low level hook ignores the module handle, and passing the managed apphost's handle is
        // what fails on .NET Core, so try the documented null first.
        _hook = NativeMethods.SetWindowsHookEx(NativeMethods.WH_MOUSE_LL, _callback, IntPtr.Zero, 0);
        var firstError = System.Runtime.InteropServices.Marshal.GetLastWin32Error();

        if (_hook == IntPtr.Zero)
        {
            _hook = NativeMethods.SetWindowsHookEx(
                NativeMethods.WH_MOUSE_LL, _callback, NativeMethods.GetModuleHandle(null), 0);
        }

        Services.Diagnostics.Write(_hook != IntPtr.Zero
            ? "mouse hook installed"
            : $"mouse hook FAILED to install (error {firstError})");
    }

    public void Dispose()
    {
        if (_hook != IntPtr.Zero)
        {
            NativeMethods.UnhookWindowsHookEx(_hook);
            _hook = IntPtr.Zero;
        }
    }

    private IntPtr OnMouseEvent(int code, IntPtr wParam, IntPtr lParam)
    {
        if (code < 0)
        {
            return NativeMethods.CallNextHookEx(_hook, code, wParam, lParam);
        }

        var message = wParam.ToInt32();
        var data = System.Runtime.InteropServices.Marshal.PtrToStructure<NativeMethods.MSLLHOOKSTRUCT>(lParam);

        // Our own replayed click. Looking at it again would arm a gesture on a click that has
        // already been judged not to be one.
        if (data.dwExtraInfo == ReplayTag)
        {
            return NativeMethods.CallNextHookEx(_hook, code, wParam, lParam);
        }

        switch (message)
        {
            case NativeMethods.WM_RBUTTONDOWN:
                _lassoing = false;
                _origin = data.pt;
                _armed = LassoEnabled && OverDesktop(data.pt);
                AfterTheHook(() => Services.Diagnostics.Write(
                    $"right down at {_origin.X},{_origin.Y} enabled={LassoEnabled} armed={_armed}"));

                // Hold the press back. Explorer takes the mouse capture the moment it sees a right
                // button down on the desktop and only lets go on the matching up, so passing the
                // down through and then swallowing the up leaves the desktop holding every mouse
                // event in the system: the pointer answers nothing until something else releases
                // the button. Either both halves reach Explorer or neither does, and which one it
                // is only becomes clear on the up.
                return _armed ? Swallow : NativeMethods.CallNextHookEx(_hook, code, wParam, lParam);

            case NativeMethods.WM_MOUSEMOVE when _armed:
                _current = data.pt;
                if (!_lassoing
                    && (Math.Abs(data.pt.X - _origin.X) >= 16 || Math.Abs(data.pt.Y - _origin.Y) >= 16))
                {
                    _lassoing = true;
                }

                if (_lassoing)
                {
                    // Let the move through. Swallowing it stops Windows moving the cursor at all,
                    // which freezes the pointer the instant the rubber band appears.
                    QueueBand();
                }

                break;

            case NativeMethods.WM_RBUTTONUP when _armed:
                var origin = ToPoint(_origin);
                var end = ToPoint(data.pt);
                var wasLasso = _lassoing;
                _armed = false;
                _lassoing = false;

                // Never build a fence, or replay a click, from inside the callback: see AfterTheHook.
                AfterTheHook(() =>
                {
                    if (wasLasso)
                    {
                        Services.Diagnostics.Write($"lasso finished {origin} -> {end}");
                        LassoCompleted?.Invoke(origin, end);
                    }
                    else
                    {
                        // Not a gesture after all, so give the desktop back the plain right-click
                        // whose press we held. Both halves go together, leaving no capture behind.
                        Services.Diagnostics.Write($"right click replayed at {_origin.X},{_origin.Y}");
                        ReplayRightClick(_origin);
                    }
                });

                return Swallow;

            case NativeMethods.WM_RBUTTONUP:
                _armed = false;
                _lassoing = false;
                break;

            case NativeMethods.WM_LBUTTONDOWN when QuickHideEnabled:
                var withinTime = data.time - _lastClickTime <= (uint)NativeMethods.GetDoubleClickTime();
                var withinReach = Math.Abs(data.pt.X - _lastClick.X) <= 6 && Math.Abs(data.pt.Y - _lastClick.Y) <= 6;
                if (withinTime && withinReach && OverDesktop(data.pt))
                {
                    // Start a fresh pair rather than zeroing the clock, so the very next click is not
                    // measured against a stale timestamp.
                    _lastClickTime = 0;
                    _lastClick = default;
                    var where = data.pt;
                    AfterTheHook(() =>
                    {
                        Services.Diagnostics.Write($"desktop double-click at {where.X},{where.Y}");
                        DesktopDoubleClicked?.Invoke();
                    });
                }
                else
                {
                    _lastClick = data.pt;
                    _lastClickTime = data.time;
                }

                break;
        }

        return NativeMethods.CallNextHookEx(_hook, code, wParam, lParam);
    }

    /// <summary>
    /// Windows holds every other mouse message until this callback returns, so anything that shows a
    /// window, takes the foreground, talks to Explorer or touches the disk has to wait until it has.
    /// Doing it here locks up the whole desktop: the pointer stops, because the shell cannot answer
    /// while its own input is queued behind us. Queueing the work on the same thread runs it moments
    /// later, with the hook already out of the way. Logging goes through here too — a synchronous
    /// file append is the last thing the input pipeline should be waiting on.
    /// </summary>
    private void AfterTheHook(Action work) => _dispatcher.BeginInvoke(DispatcherPriority.Input, work);

    /// <summary>
    /// Moves the rubber band outside the callback, and only once per frame however many moves
    /// arrive: the band is a window, and resizing a window inside the hook is what freezes the
    /// pointer. Render outranks Input, so a band update still queued when the drag ends is drawn
    /// before the fence is built.
    /// </summary>
    private void QueueBand()
    {
        if (_bandQueued)
        {
            return;
        }

        _bandQueued = true;
        _dispatcher.BeginInvoke(DispatcherPriority.Render, () =>
        {
            _bandQueued = false;
            if (_lassoing)
            {
                LassoUpdated?.Invoke(ToPoint(_origin), ToPoint(_current));
            }
        });
    }

    /// <summary>
    /// Sends the desktop the right-click Palisades held back, tagged so the hook knows it again.
    /// Absolute coordinates are normalised across the whole virtual desktop, so the menu opens on
    /// the monitor that was clicked rather than the primary one.
    /// </summary>
    private static void ReplayRightClick(NativeMethods.POINT point)
    {
        var left = NativeMethods.GetSystemMetrics(NativeMethods.SM_XVIRTUALSCREEN);
        var top = NativeMethods.GetSystemMetrics(NativeMethods.SM_YVIRTUALSCREEN);
        var width = NativeMethods.GetSystemMetrics(NativeMethods.SM_CXVIRTUALSCREEN);
        var height = NativeMethods.GetSystemMetrics(NativeMethods.SM_CYVIRTUALSCREEN);
        if (width <= 0 || height <= 0)
        {
            return;
        }

        var x = (int)Math.Round((point.X - left) * 65535.0 / width);
        var y = (int)Math.Round((point.Y - top) * 65535.0 / height);

        const uint absolute = NativeMethods.MOUSEEVENTF_ABSOLUTE | NativeMethods.MOUSEEVENTF_VIRTUALDESK;
        var inputs = new[]
        {
            Mouse(x, y, absolute | NativeMethods.MOUSEEVENTF_MOVE | NativeMethods.MOUSEEVENTF_RIGHTDOWN),
            Mouse(x, y, absolute | NativeMethods.MOUSEEVENTF_RIGHTUP)
        };

        NativeMethods.SendInput((uint)inputs.Length, inputs,
            System.Runtime.InteropServices.Marshal.SizeOf<NativeMethods.INPUT>());
    }

    private static NativeMethods.INPUT Mouse(int x, int y, uint flags) => new()
    {
        type = NativeMethods.INPUT_MOUSE,
        mi = new NativeMethods.MOUSEINPUT
        {
            dx = x,
            dy = y,
            dwFlags = flags,
            dwExtraInfo = ReplayTag
        }
    };

    private bool OverDesktop(NativeMethods.POINT point)
    {
        if (!DesktopWindows.IsDesktopSurface(NativeMethods.WindowFromPoint(point)))
        {
            return false;
        }

        return IsOverDrawnIcon?.Invoke(ToPoint(point)) != true;
    }

    private static Point ToPoint(NativeMethods.POINT point) => new(point.X, point.Y);
}
