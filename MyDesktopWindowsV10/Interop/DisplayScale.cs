using System.Windows;
using System.Windows.Media;

namespace MyDesktop.Interop;

/// <summary>
/// Converts between the physical pixels the mouse hook reports and the device independent units WPF
/// positions windows in.
/// </summary>
internal static class DisplayScale
{
    public static double Factor { get; private set; } = 1.0;

    public static void CaptureFrom(Visual visual)
    {
        var source = PresentationSource.FromVisual(visual);
        var scale = source?.CompositionTarget?.TransformToDevice.M11 ?? 0;
        if (scale > 0.1)
        {
            Factor = scale;
        }
    }

    public static Point FromDevice(Point point) => new(point.X / Factor, point.Y / Factor);

    public static Point ToDevice(Point point) => new(point.X * Factor, point.Y * Factor);
}
