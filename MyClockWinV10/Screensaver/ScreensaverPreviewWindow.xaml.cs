using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using MyClockWinV10.Models;

namespace MyClockWinV10.Screensaver;

public partial class ScreensaverPreviewWindow : Window
{
    private readonly IntPtr _parentHwnd;
    private readonly ScreensaverSettings _settings;

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);

    [DllImport("user32.dll")]
    private static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left, Top, Right, Bottom;
        public int Width  => Right - Left;
        public int Height => Bottom - Top;
    }

    public ScreensaverPreviewWindow(IntPtr parentHwnd, ScreensaverSettings settings)
    {
        _parentHwnd = parentHwnd;
        _settings   = settings;
        InitializeComponent();
        Loaded += OnLoaded;
        Closed += (_, _) => ClockHost.Stop();
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        var helper = new WindowInteropHelper(this);
        SetParent(helper.Handle, _parentHwnd);

        if (GetClientRect(_parentHwnd, out var rect))
        {
            Width  = Math.Max(1, rect.Width);
            Height = Math.Max(1, rect.Height);
        }

        ApplyClockSize();
        ClockHost.Apply(_settings);
        ClockHost.Start();
    }

    private void ApplyClockSize()
    {
        double minDim = Math.Min(Width, Height);
        double size = minDim * Math.Clamp(_settings.ClockSizePercent, 15, 75) / 100.0;

        if (_settings.IsDigital)
        {
            ClockHost.Width  = size * 2.4;
            ClockHost.Height = size * 0.72;
        }
        else
        {
            ClockHost.Width  = size;
            ClockHost.Height = size;
        }
    }
}
