using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

namespace CodeAnalyzer.Controls;

internal sealed class DiagramZoomController
{
    private const float MinZoom = 0.25f;
    private const float MaxZoom = 4f;
    private const float ZoomStep = 1.12f;
    private const int ScrollPadding = 48;

    private float _zoom = 1f;
    private Bitmap? _cache;
    private Size _cacheContentSize;
    private float _cacheZoom = -1f;

    public float Zoom => _zoom;

    public int ZoomPercent => (int)Math.Round(_zoom * 100);

    public void Reset()
    {
        _zoom = 1f;
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
        var documentWidth = GetDocumentWidth(logicalContentSize);
        var documentHeight = GetDocumentHeight(logicalContentSize);
        control.AutoScrollMinSize = new Size(
            Math.Max(control.ClientSize.Width, documentWidth),
            Math.Max(control.ClientSize.Height, documentHeight));
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
        ApplyContentSize(control, logicalContentSize);
        EnsureCache(logicalContentSize, backgroundColor, drawLogicalContent);

        if (_cache is null || clipRect.Width <= 0 || clipRect.Height <= 0)
        {
            return;
        }

        var scrollX = -control.AutoScrollPosition.X;
        var scrollY = -control.AutoScrollPosition.Y;
        var srcX = scrollX + clipRect.X;
        var srcY = scrollY + clipRect.Y;
        var srcRect = new Rectangle(srcX, srcY, clipRect.Width, clipRect.Height);
        srcRect.Intersect(new Rectangle(0, 0, _cache.Width, _cache.Height));

        if (srcRect.Width <= 0 || srcRect.Height <= 0)
        {
            return;
        }

        var destRect = new Rectangle(
            clipRect.X + (srcRect.X - srcX),
            clipRect.Y + (srcRect.Y - srcY),
            srcRect.Width,
            srcRect.Height);

        target.DrawImage(_cache, destRect, srcRect, GraphicsUnit.Pixel);
    }

    public Point ClientToDocument(ScrollableControl control, Point client)
    {
        return new Point(
            (int)((client.X - control.AutoScrollPosition.X) / _zoom),
            (int)((client.Y - control.AutoScrollPosition.Y) / _zoom));
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

        InvalidateCache();

        var docX = (e.X - control.AutoScrollPosition.X) / oldZoom;
        var docY = (e.Y - control.AutoScrollPosition.Y) / oldZoom;

        ApplyContentSize(control, logicalContentSize);
        control.AutoScrollPosition = new Point(
            Math.Max(0, (int)(docX * _zoom - e.X)),
            Math.Max(0, (int)(docY * _zoom - e.Y)));

        return true;
    }

    public void ScrollToDocumentPoint(ScrollableControl control, Point documentPoint, Size logicalContentSize, int margin = 24)
    {
        ApplyContentSize(control, logicalContentSize);
        control.AutoScrollPosition = new Point(
            Math.Max(0, (int)(documentPoint.X * _zoom - margin)),
            Math.Max(0, (int)(documentPoint.Y * _zoom - margin)));
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

        var width = Math.Max(1, GetDocumentWidth(logicalContentSize));
        var height = Math.Max(1, GetDocumentHeight(logicalContentSize));
        _cache = new Bitmap(width, height, PixelFormat.Format32bppArgb);

        using (var graphics = Graphics.FromImage(_cache))
        {
            graphics.Clear(backgroundColor);
            graphics.SmoothingMode = SmoothingMode.AntiAlias;
            graphics.ScaleTransform(_zoom, _zoom);
            drawLogicalContent(graphics);
        }

        _cacheContentSize = logicalContentSize;
        _cacheZoom = _zoom;
    }

    private int GetDocumentWidth(Size logicalContentSize) =>
        (int)Math.Ceiling(logicalContentSize.Width * _zoom) + ScrollPadding;

    private int GetDocumentHeight(Size logicalContentSize) =>
        (int)Math.Ceiling(logicalContentSize.Height * _zoom) + ScrollPadding;
}
