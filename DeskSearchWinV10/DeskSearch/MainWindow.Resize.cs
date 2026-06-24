using System.Windows;
using System.Windows.Input;
using Point = System.Windows.Point;
using MouseEventArgs = System.Windows.Input.MouseEventArgs;

namespace DeskSearch;

public partial class MainWindow
{
    private bool _isResizingWidth;
    private bool _resizeFromLeft;
    private Point _resizeStartScreenPoint;
    private double _resizeStartWidth;
    private double _resizeStartLeft;

    private void LeftResizeGrip_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        StartWidthResize(fromLeft: true, e);
    }

    private void RightResizeGrip_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        StartWidthResize(fromLeft: false, e);
    }

    private void StartWidthResize(bool fromLeft, MouseButtonEventArgs e)
    {
        _isResizingWidth = true;
        _resizeFromLeft = fromLeft;
        _resizeStartScreenPoint = PointToScreen(e.GetPosition(this));
        _resizeStartWidth = Width;
        _resizeStartLeft = Left;

        CaptureMouse();
        MouseMove += Window_ResizeMouseMove;
        MouseLeftButtonUp += Window_ResizeMouseLeftButtonUp;
        e.Handled = true;
    }

    private void Window_ResizeMouseMove(object sender, MouseEventArgs e)
    {
        if (!_isResizingWidth || e.LeftButton != MouseButtonState.Pressed)
            return;

        var current = PointToScreen(e.GetPosition(this));
        var deltaX = current.X - _resizeStartScreenPoint.X;

        if (_resizeFromLeft)
        {
            var newWidth = ClampWindowWidth(_resizeStartWidth - deltaX);
            Left = _resizeStartLeft + (_resizeStartWidth - newWidth);
            Width = newWidth;
            return;
        }

        Width = ClampWindowWidth(_resizeStartWidth + deltaX);
    }

    private void Window_ResizeMouseLeftButtonUp(object sender, MouseButtonEventArgs e)
    {
        if (!_isResizingWidth)
            return;

        EndWidthResize();
    }

    private void EndWidthResize()
    {
        _isResizingWidth = false;
        ReleaseMouseCapture();
        MouseMove -= Window_ResizeMouseMove;
        MouseLeftButtonUp -= Window_ResizeMouseLeftButtonUp;
        SaveWindowLayout();
    }

    private double ClampWindowWidth(double width) =>
        Math.Clamp(width, MinWidth, MaxWidth);
}
