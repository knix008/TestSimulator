using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

namespace CodeAnalyzer.Controls;

internal sealed class DiagramZoomController
{
    private const float MinZoom = 0.25f;
    private const float MaxZoom = 32f;
    private const float ZoomStep = 1.12f;
    private const int ScrollPadding = 48;

    private float _zoom = 1f;
    private Bitmap? _cache;
    private Size _cacheContentSize;
    private float _cacheZoom = -1f;
    private Size _lastScrollMinSize = Size.Empty;
    private Size _lastClientSize = Size.Empty;

    public float Zoom => _zoom;

    public int ZoomPercent => (int)Math.Round(_zoom * 100);

    public void Reset()
    {
        _zoom = 1f;
        _lastScrollMinSize = Size.Empty;
        _lastClientSize = Size.Empty;
        InvalidateCache();
    }

    public void InvalidateCache()
    {
        _cache?.Dispose();
        _cache = null;
        _cacheZoom = -1f;
    }

    public void ApplyContentSize(ScrollableControl control, Size logicalContentSize)
    {
        var newMin = ComputeScrollMinSize(control, logicalContentSize);
        var clientSize = control.ClientSize;
        if (newMin == _lastScrollMinSize && clientSize == _lastClientSize)
        {
            return;
        }

        var scroll = GetScrollOffset(control);
        _lastScrollMinSize = newMin;
        _lastClientSize = clientSize;
        control.AutoScrollMinSize = newMin;
        control.AutoScrollPosition = new Point(
            Math.Clamp(scroll.X, 0, GetMaxScrollX(control, logicalContentSize)),
            Math.Clamp(scroll.Y, 0, GetMaxScrollY(control, logicalContentSize)));
    }

    public static Size InflateContentSize(Size layoutSize, IEnumerable<Rectangle> bounds, int margin = 64)
    {
        var union = Rectangle.Empty;
        foreach (var rect in bounds)
        {
            if (rect.IsEmpty)
            {
                continue;
            }

            union = union.IsEmpty ? rect : Rectangle.Union(union, rect);
        }

        if (union.IsEmpty)
        {
            return layoutSize;
        }

        return new Size(
            Math.Max(layoutSize.Width, union.Right + margin),
            Math.Max(layoutSize.Height, union.Bottom + margin));
    }

    public void PaintDocument(
        Graphics target,
        ScrollableControl control,
        Rectangle clipRect,
        Size logicalContentSize,
        Color backgroundColor,
        Action<Graphics> drawLogicalContent)
    {
        EnsureCache(logicalContentSize, backgroundColor, drawLogicalContent);

        if (clipRect.Width <= 0 || clipRect.Height <= 0)
        {
            return;
        }

        if (_cache is not null && TryDrawFromCache(target, control, clipRect))
        {
            return;
        }

        DrawViewport(target, control, clipRect, backgroundColor, drawLogicalContent);
    }

    private bool TryDrawFromCache(Graphics target, ScrollableControl control, Rectangle clipRect)
    {
        if (_cache is null)
        {
            return false;
        }

        var scroll = GetScrollOffset(control);
        var srcX = scroll.X + clipRect.X;
        var srcY = scroll.Y + clipRect.Y;
        var srcRect = new Rectangle(srcX, srcY, clipRect.Width, clipRect.Height);
        srcRect.Intersect(new Rectangle(0, 0, _cache.Width, _cache.Height));

        if (srcRect.Width <= 0 || srcRect.Height <= 0)
        {
            return false;
        }

        var destRect = new Rectangle(
            clipRect.X + (srcRect.X - srcX),
            clipRect.Y + (srcRect.Y - srcY),
            srcRect.Width,
            srcRect.Height);

        target.InterpolationMode = InterpolationMode.HighQualityBicubic;
        target.PixelOffsetMode = PixelOffsetMode.HighQuality;
        target.DrawImage(_cache, destRect, srcRect, GraphicsUnit.Pixel);
        return true;
    }

    private void DrawViewport(
        Graphics target,
        ScrollableControl control,
        Rectangle clipRect,
        Color backgroundColor,
        Action<Graphics> drawLogicalContent)
    {
        var display = control.DisplayRectangle;

        target.SetClip(clipRect);
        try
        {
            target.TranslateTransform(display.X, display.Y);
            target.ScaleTransform(_zoom, _zoom);
            target.Clear(backgroundColor);
            target.SmoothingMode = SmoothingMode.AntiAlias;
            target.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
            drawLogicalContent(target);
        }
        finally
        {
            target.ResetTransform();
            target.ResetClip();
        }
    }

    public Point ClientToDocument(ScrollableControl control, Point client)
    {
        var display = control.DisplayRectangle;
        return new Point(
            (int)((client.X - display.X) / _zoom),
            (int)((client.Y - display.Y) / _zoom));
    }

    public bool HandleMouseWheel(ScrollableControl control, MouseEventArgs e, Size logicalContentSize)
    {
        if ((Control.ModifierKeys & Keys.Control) == 0)
        {
            return false;
        }

        var oldZoom = _zoom;
        if (e.Delta > 0)
        {
            _zoom = Math.Min(MaxZoom, _zoom * ZoomStep);
        }
        else if (e.Delta < 0)
        {
            _zoom = Math.Max(MinZoom, _zoom / ZoomStep);
        }
        else
        {
            return false;
        }

        if (Math.Abs(_zoom - oldZoom) < 0.0001f)
        {
            return true;
        }

        _lastScrollMinSize = Size.Empty;
        _lastClientSize = Size.Empty;
        InvalidateCache();

        var display = control.DisplayRectangle;
        var docX = (e.X - display.X) / oldZoom;
        var docY = (e.Y - display.Y) / oldZoom;

        ApplyContentSize(control, logicalContentSize);
        control.AutoScrollPosition = new Point(
            Math.Clamp((int)(docX * _zoom - e.X), 0, GetMaxScrollX(control, logicalContentSize)),
            Math.Clamp((int)(docY * _zoom - e.Y), 0, GetMaxScrollY(control, logicalContentSize)));

        return true;
    }

    public void ScrollToDocumentPoint(ScrollableControl control, Point documentPoint, Size logicalContentSize, int margin = 24)
    {
        ApplyContentSize(control, logicalContentSize);
        control.AutoScrollPosition = new Point(
            Math.Clamp((int)(documentPoint.X * _zoom - margin), 0, GetMaxScrollX(control, logicalContentSize)),
            Math.Clamp((int)(documentPoint.Y * _zoom - margin), 0, GetMaxScrollY(control, logicalContentSize)));
    }

    private void EnsureCache(Size logicalContentSize, Color backgroundColor, Action<Graphics> drawLogicalContent)
    {
        if (_cache is not null
            && _cacheContentSize == logicalContentSize
            && Math.Abs(_cacheZoom - _zoom) < 0.0001f)
        {
            return;
        }

        _cache?.Dispose();
        _cache = null;
        _cacheZoom = -1f;

        var width = Math.Max(1, GetDocumentWidth(logicalContentSize));
        var height = Math.Max(1, GetDocumentHeight(logicalContentSize));
        if (!CanAllocateCacheBitmap(width, height))
        {
            _cacheContentSize = logicalContentSize;
            return;
        }

        try
        {
            _cache = new Bitmap(width, height, PixelFormat.Format32bppArgb);

            using (var graphics = Graphics.FromImage(_cache))
            {
                graphics.Clear(backgroundColor);
                graphics.SmoothingMode = SmoothingMode.AntiAlias;
                graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
                graphics.ScaleTransform(_zoom, _zoom);
                drawLogicalContent(graphics);
            }

            _cacheContentSize = logicalContentSize;
            _cacheZoom = _zoom;
        }
        catch
        {
            _cache?.Dispose();
            _cache = null;
            _cacheZoom = -1f;
            _cacheContentSize = logicalContentSize;
        }
    }

    private static bool CanAllocateCacheBitmap(int width, int height)
    {
        const int maxDimension = 16_384;
        const long maxPixels = 64L * 1024 * 1024;

        if (width > maxDimension || height > maxDimension)
        {
            return false;
        }

        return (long)width * height <= maxPixels;
    }

    /// <summary>WinForms <see cref="Control.AutoScrollPosition"/>은 양수 오프셋, <see cref="Control.DisplayRectangle"/>은 음수 위치를 씁니다.</summary>
    private static Point GetScrollOffset(ScrollableControl control)
    {
        var display = control.DisplayRectangle;
        return new Point(-display.X, -display.Y);
    }

    private static Size ComputeScrollMinSize(ScrollableControl control, Size logicalContentSize, float zoom)
    {
        var documentWidth = (int)Math.Ceiling(logicalContentSize.Width * zoom) + ScrollPadding;
        var documentHeight = (int)Math.Ceiling(logicalContentSize.Height * zoom) + ScrollPadding;
        return new Size(
            Math.Max(control.ClientSize.Width, documentWidth),
            Math.Max(control.ClientSize.Height, documentHeight));
    }

    private Size ComputeScrollMinSize(ScrollableControl control, Size logicalContentSize) =>
        ComputeScrollMinSize(control, logicalContentSize, _zoom);

    private int GetMaxScrollX(ScrollableControl control, Size logicalContentSize) =>
        Math.Max(0, ComputeScrollMinSize(control, logicalContentSize).Width - Math.Max(1, control.ClientSize.Width));

    private int GetMaxScrollY(ScrollableControl control, Size logicalContentSize) =>
        Math.Max(0, ComputeScrollMinSize(control, logicalContentSize).Height - Math.Max(1, control.ClientSize.Height));

    private int GetDocumentWidth(Size logicalContentSize) =>
        (int)Math.Ceiling(logicalContentSize.Width * _zoom) + ScrollPadding;

    private int GetDocumentHeight(Size logicalContentSize) =>
        (int)Math.Ceiling(logicalContentSize.Height * _zoom) + ScrollPadding;
}
