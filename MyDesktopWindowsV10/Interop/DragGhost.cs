using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;

namespace MyDesktop.Interop;

/// <summary>
/// The picture of what is being dragged, following the cursor.
///
/// The shell has a helper for this, and it is what Explorer uses, but it only works when the drop
/// target asks the shell to paint it and when the data object hands the image back: WPF's drop
/// targets never ask, and WPF's DataObject answers the shell's request with DV_E_FORMATETC. So
/// MyDesktop carries its own ghost — a click-through topmost window holding a snapshot of the item.
/// </summary>
internal sealed class DragGhost : IDisposable
{
    private const int WsExTransparent = 0x00000020;
    private const int WsExNoActivate = 0x08000000;

    private readonly Window _window;
    private readonly DispatcherTimer _follow;
    private readonly Point _hotspot;

    private DragGhost(BitmapSource bitmap, Point hotspot, double scale, double opacity)
    {
        _hotspot = hotspot;

        _window = new Window
        {
            WindowStyle = WindowStyle.None,
            AllowsTransparency = true,
            Background = Brushes.Transparent,
            ResizeMode = ResizeMode.NoResize,
            SizeToContent = SizeToContent.WidthAndHeight,
            ShowInTaskbar = false,
            ShowActivated = false,
            Topmost = true,
            IsHitTestVisible = false,
            Focusable = false,
            Opacity = opacity,
            Content = new Image
            {
                Source = bitmap,
                Stretch = Stretch.Fill,
                Width = bitmap.PixelWidth / scale,
                Height = bitmap.PixelHeight / scale
            }
        };

        _window.SourceInitialized += (_, _) =>
        {
            // Never take the click, never take focus: the drag underneath has to keep working.
            var handle = new System.Windows.Interop.WindowInteropHelper(_window).Handle;
            var style = NativeMethods.GetWindowLongAuto(handle, NativeMethods.GWL_EXSTYLE).ToInt64();
            NativeMethods.SetWindowLongAuto(handle, NativeMethods.GWL_EXSTYLE,
                new IntPtr(style | WsExTransparent | WsExNoActivate | NativeMethods.WS_EX_TOOLWINDOW));
        };

        _window.Show();
        Follow();

        // GiveFeedback is not raised often enough to look smooth, so the ghost chases the cursor itself.
        _follow = new DispatcherTimer(DispatcherPriority.Render) { Interval = TimeSpan.FromMilliseconds(15) };
        _follow.Tick += (_, _) => Follow();
        _follow.Start();
    }

    /// <summary>
    /// Takes the picture and puts it under the cursor. <paramref name="hotspot"/> is where the cursor
    /// sits inside the item, in device independent units. Returns null when there is nothing to show.
    /// </summary>
    public static DragGhost? Show(FrameworkElement visual, Point hotspot, double opacity = 0.75)
    {
        var scale = PresentationSource.FromVisual(visual)?.CompositionTarget?.TransformToDevice.M11 ?? 1.0;
        var bitmap = Render(visual, scale);
        return bitmap is null ? null : new DragGhost(bitmap, hotspot, scale, opacity);
    }

    public void Dispose()
    {
        _follow.Stop();
        _window.Close();
    }

    private void Follow()
    {
        if (!NativeMethods.GetCursorPos(out var cursor))
        {
            return;
        }

        // Physical pixels straight to the window handle, so a mixed DPI desktop cannot skew the ghost.
        var handle = new System.Windows.Interop.WindowInteropHelper(_window).Handle;
        if (handle == IntPtr.Zero)
        {
            return;
        }

        var scale = PresentationSource.FromVisual(_window)?.CompositionTarget?.TransformToDevice.M11 ?? 1.0;
        NativeMethods.SetWindowPos(
            handle,
            IntPtr.Zero,
            cursor.X - (int)Math.Round(_hotspot.X * scale),
            cursor.Y - (int)Math.Round(_hotspot.Y * scale),
            0,
            0,
            NativeMethods.SWP_NOSIZE | NativeMethods.SWP_NOACTIVATE | NativeMethods.SWP_NOZORDER);
    }

    private static BitmapSource? Render(FrameworkElement visual, double scale)
    {
        var width = (int)Math.Ceiling(visual.ActualWidth * scale);
        var height = (int)Math.Ceiling(visual.ActualHeight * scale);
        if (width <= 0 || height <= 0 || width > 2048 || height > 2048)
        {
            return null;
        }

        // Rendering the element directly keeps the offset it has inside its panel, which pushes an icon
        // that is not in the top left corner clean out of the bitmap. Painting it as a brush drops that
        // offset, so every icon lands at 0,0 the way the ghost needs it.
        var copy = new DrawingVisual();
        using (var context = copy.RenderOpen())
        {
            context.DrawRectangle(
                new VisualBrush(visual) { Stretch = Stretch.None, AlignmentX = AlignmentX.Left, AlignmentY = AlignmentY.Top },
                null,
                new Rect(0, 0, visual.ActualWidth, visual.ActualHeight));
        }

        var target = new RenderTargetBitmap(width, height, 96 * scale, 96 * scale, PixelFormats.Pbgra32);
        target.Render(copy);
        target.Freeze();
        return target;
    }
}
