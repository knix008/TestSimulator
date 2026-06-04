namespace CodeAnalyzer.Controls;

/// <summary>왼쪽 버튼 드래그로 <see cref="ScrollableControl"/> 스크롤(패닝)을 처리합니다.</summary>
internal sealed class DiagramScrollPan
{
    private bool _active;
    private Point _startClient;
    private Point _startScroll;
    private bool _dragged;
    private bool _suppressClick;

    public bool IsDragging => _dragged;

    public bool Begin(MouseEventArgs e, ScrollableControl control)
    {
        if (e.Button != MouseButtons.Left)
        {
            return false;
        }

        _active = true;
        _dragged = false;
        _suppressClick = false;
        _startClient = e.Location;
        _startScroll = DiagramZoomController.GetScrollOffset(control);
        control.Capture = true;
        return true;
    }

    public bool HandleMove(MouseEventArgs e, ScrollableControl control, DiagramZoomController zoom, Size logicalContentSize)
    {
        if (!_active)
        {
            return false;
        }

        if (!ExceededDragThreshold(e.Location))
        {
            return false;
        }

        if (!_dragged)
        {
            _dragged = true;
            _suppressClick = true;
            control.Cursor = Cursors.SizeAll;
        }

        var dx = e.X - _startClient.X;
        var dy = e.Y - _startClient.Y;
        control.AutoScrollPosition = new Point(
            Math.Clamp(_startScroll.X - dx, 0, zoom.GetMaxScrollX(control, logicalContentSize)),
            Math.Clamp(_startScroll.Y - dy, 0, zoom.GetMaxScrollY(control, logicalContentSize)));
        return true;
    }

    /// <summary>패닝이 끝났으면 true(이번 제스처는 클릭으로 처리하지 않음).</summary>
    public bool End(ScrollableControl control)
    {
        if (!_active)
        {
            return false;
        }

        var blockClick = _dragged;
        if (_dragged)
        {
            _suppressClick = true;
        }

        _active = false;
        _dragged = false;
        control.Capture = false;
        return blockClick;
    }

    public bool ShouldBlockClick(Point clientPoint)
    {
        if (_suppressClick)
        {
            return true;
        }

        return _active && ExceededDragThreshold(clientPoint);
    }

    public void AcknowledgeClick()
    {
        _suppressClick = false;
    }

    private bool ExceededDragThreshold(Point clientPoint)
    {
        var drag = SystemInformation.DragSize;
        return Math.Abs(clientPoint.X - _startClient.X) >= drag.Width
            || Math.Abs(clientPoint.Y - _startClient.Y) >= drag.Height;
    }
}
