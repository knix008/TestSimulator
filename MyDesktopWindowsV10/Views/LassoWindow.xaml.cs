using System.Windows;
using System.Windows.Controls;
using MyDesktop.Interop;

namespace MyDesktop.Views;

/// <summary>
/// The rubber band drawn while the right mouse button is dragged across empty desktop.
/// </summary>
public partial class LassoWindow : Window
{
    public LassoWindow()
    {
        InitializeComponent();
        Left = SystemParameters.VirtualScreenLeft;
        Top = SystemParameters.VirtualScreenTop;
        Width = SystemParameters.VirtualScreenWidth;
        Height = SystemParameters.VirtualScreenHeight;

        // Create the window up front so the first right-drag does not stall inside the mouse hook.
        Show();
        DisplayScale.CaptureFrom(this);
        Visibility = Visibility.Hidden;
    }

    /// <summary>Updates the band. Both points are physical screen pixels from the mouse hook.</summary>
    public void Track(Point origin, Point current)
    {
        var bounds = Normalise(origin, current);

        if (Visibility != Visibility.Visible)
        {
            Visibility = Visibility.Visible;
        }

        Canvas.SetLeft(Marquee, bounds.X - Left);
        Canvas.SetTop(Marquee, bounds.Y - Top);
        Marquee.Width = bounds.Width;
        Marquee.Height = bounds.Height;
        SizeLabel.Text = $"{Math.Round(bounds.Width)} × {Math.Round(bounds.Height)}";
    }

    /// <summary>Hides the band and returns the fence bounds in device independent units.</summary>
    public Rect Finish(Point origin, Point end)
    {
        Visibility = Visibility.Hidden;
        return Normalise(origin, end);
    }

    private static Rect Normalise(Point origin, Point current)
    {
        var first = DisplayScale.FromDevice(origin);
        var second = DisplayScale.FromDevice(current);
        return new Rect(
            Math.Min(first.X, second.X),
            Math.Min(first.Y, second.Y),
            Math.Abs(first.X - second.X),
            Math.Abs(first.Y - second.Y));
    }
}
