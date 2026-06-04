using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

namespace CodeAnalyzer.Controls;

internal sealed class DiagramZoomController
{
    private const float MinZoom = 0.25f;
    /// <summary>논리 배율 상한(휠 줌). 캐시 비트맵은 별도 한도로 뷰포트 렌더로 대체합니다.</summary>
    private const float MaxZoom = 32f;
    private const float ZoomStep = 1.12f;
    private const int ScrollPadding = 48;

    /// <summary>이 배율 초과 시 전체 캐시 비트맵을 만들지 않고 뷰포트만 그립니다.</summary>
    private const float MaxCacheZoom = 8f;

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

        if (clipRect.Width <= 0 || clipRect.Height <= 0)
        {
            return;
        }

        if (_cache is null)
        {
            DrawViewportWithoutCache(target, control, clipRect, backgroundColor, drawLogicalContent);
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

        target.InterpolationMode = InterpolationMode.HighQualityBicubic;
        target.PixelOffsetMode = PixelOffsetMode.HighQuality;
        target.DrawImage(_cache, destRect, srcRect, GraphicsUnit.Pixel);
    }

    private void DrawViewportWithoutCache(
        Graphics target,
        ScrollableControl control,
        Rectangle clipRect,
        Color backgroundColor,
        Action<Graphics> drawLogicalContent)
    {
        target.SetClip(clipRect);
        try
        {
            target.TranslateTransform(-control.AutoScrollPosition.X, -control.AutoScrollPosition.Y);
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
        _cache = null;
        _cacheZoom = -1f;

        if (_zoom > MaxCacheZoom)
        {
            _cacheContentSize = logicalContentSize;
            return;
        }

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

    private int GetDocumentWidth(Size logicalContentSize) =>
        (int)Math.Ceiling(logicalContentSize.Width * _zoom) + ScrollPadding;

    private int GetDocumentHeight(Size logicalContentSize) =>
        (int)Math.Ceiling(logicalContentSize.Height * _zoom) + ScrollPadding;
}
