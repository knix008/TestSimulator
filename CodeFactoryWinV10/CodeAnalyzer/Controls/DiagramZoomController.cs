namespace CodeAnalyzer.Controls;

internal sealed class DiagramZoomController
{
    private const float MinZoom = 0.25f;
    private const float MaxZoom = 4f;
    private const float ZoomStep = 1.12f;

    private float _zoom = 1f;

    public float Zoom => _zoom;

    public int ZoomPercent => (int)Math.Round(_zoom * 100);

    public void Reset() => _zoom = 1f;

    public void ApplyContentSize(ScrollableControl control, Size logicalContentSize)
    {
        var scaledWidth = Math.Max(control.ClientSize.Width, (int)Math.Ceiling(logicalContentSize.Width * _zoom));
        var scaledHeight = Math.Max(control.ClientSize.Height, (int)Math.Ceiling(logicalContentSize.Height * _zoom));
        control.AutoScrollMinSize = new Size(scaledWidth, scaledHeight);
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

    public void ApplyGraphicsScale(Graphics graphics) => graphics.ScaleTransform(_zoom, _zoom);
}
