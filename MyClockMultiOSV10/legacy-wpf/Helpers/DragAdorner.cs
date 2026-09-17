using System.Windows;
using System.Windows.Documents;
using System.Windows.Media;

namespace MyClockWinV10.Helpers;

/// <summary>Follows the pointer during drag-and-drop.</summary>
public sealed class DragAdorner : Adorner
{
    private readonly UIElement _child;
    private Point _offset;
    private Point _position;

    public DragAdorner(UIElement adornedElement, UIElement dragVisual, Point offset)
        : base(adornedElement)
    {
        _child  = dragVisual;
        _offset = offset;
        IsHitTestVisible = false;
        AddVisualChild(_child);
    }

    public void UpdatePosition(Point positionInAdornedElement)
    {
        _position = positionInAdornedElement;
        InvalidateArrange();
    }

    protected override int VisualChildrenCount => 1;

    protected override Visual GetVisualChild(int index) => _child;

    protected override Size MeasureOverride(Size constraint)
    {
        _child.Measure(constraint);
        return _child.DesiredSize;
    }

    protected override Size ArrangeOverride(Size finalSize)
    {
        var x = _position.X - _offset.X;
        var y = _position.Y - _offset.Y;
        _child.Arrange(new Rect(x, y, _child.DesiredSize.Width, _child.DesiredSize.Height));
        return finalSize;
    }
}
