using System.Windows;
using System.Windows.Media;
using Point = System.Windows.Point;
using Rect = System.Windows.Rect;

namespace DeskSearch.Helpers;

internal static class ScreenHelper
{
    /// <summary>
    /// Returns the working area of the monitor containing <paramref name="screenPointDip"/>,
    /// in the same device-independent screen coordinate space as <see cref="Visual.PointToScreen"/>.
    /// </summary>
    public static Rect GetMonitorWorkAreaInScreenDips(Visual visual, Point screenPointDip)
    {
        var source = PresentationSource.FromVisual(visual);
        if (source?.CompositionTarget is not { TransformToDevice: { } toDevice })
            return SystemParameters.WorkArea;

        var physicalPoint = new System.Drawing.Point(
            (int)Math.Round(screenPointDip.X * toDevice.M11),
            (int)Math.Round(screenPointDip.Y * toDevice.M22));

        var workArea = System.Windows.Forms.Screen.FromPoint(physicalPoint).WorkingArea;
        var dpiX = toDevice.M11;
        var dpiY = toDevice.M22;

        return new Rect(
            workArea.X / dpiX,
            workArea.Y / dpiY,
            workArea.Width / dpiX,
            workArea.Height / dpiY);
    }
}
