using System.Windows;
using System.Windows.Forms;
using MyClockWinV10.Models;

namespace MyClockWinV10.Screensaver;

public partial class ScreensaverWindow : Window
{
    private readonly ScreensaverSettings _settings;
    private System.Drawing.Point? _lastMouse;
    private bool _closing;

    public ScreensaverWindow(ScreensaverSettings settings, Screen screen)
    {
        _settings = settings;
        InitializeComponent();

        Left   = screen.Bounds.Left;
        Top    = screen.Bounds.Top;
        Width  = screen.Bounds.Width;
        Height = screen.Bounds.Height;
        WindowState = WindowState.Normal;

        Loaded += OnLoaded;
        Closed += (_, _) => ClockHost.Stop();
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        ApplyClockSize();
        ClockHost.Apply(_settings);
        ClockHost.Start();
    }

    private void ApplyClockSize()
    {
        double minDim = Math.Min(ActualWidth, ActualHeight);
        if (minDim < 1) minDim = Math.Min(Width, Height);
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

    private void TryClose()
    {
        if (_closing) return;
        _closing = true;
        System.Windows.Application.Current.Shutdown();
    }

    private void Window_KeyDown(object sender, System.Windows.Input.KeyEventArgs e) => TryClose();

    private void Window_MouseDown(object sender, System.Windows.Input.MouseButtonEventArgs e) => TryClose();

    private void Window_MouseWheel(object sender, System.Windows.Input.MouseWheelEventArgs e) => TryClose();

    private void Window_MouseMove(object sender, System.Windows.Input.MouseEventArgs e)
    {
        var pos = System.Windows.Forms.Control.MousePosition;
        if (_lastMouse is null)
        {
            _lastMouse = pos;
            return;
        }
        if (Math.Abs(pos.X - _lastMouse.Value.X) > 4 || Math.Abs(pos.Y - _lastMouse.Value.Y) > 4)
            TryClose();
    }
}
