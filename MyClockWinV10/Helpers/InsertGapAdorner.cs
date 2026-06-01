using System.Windows;
using System.Windows.Documents;
using System.Windows.Media;

namespace MyClockWinV10.Helpers;

/// <summary>Highlights the drop slot while reordering list items.</summary>
public sealed class InsertGapAdorner : Adorner
{
    private Rect _rect;
    private readonly Brush _fill;
    private readonly Pen _pen;

    public InsertGapAdorner(UIElement adornedElement, Brush accentBrush) : base(adornedElement)
    {
        IsHitTestVisible = false;
        var fill = accentBrush.CloneCurrentValue();
        fill.Opacity = 0.22;
        if (fill.CanFreeze) fill.Freeze();
        _fill = fill;

        _pen = new Pen(accentBrush, 2.5) { DashStyle = DashStyles.Dash };
        if (_pen.CanFreeze) _pen.Freeze();
    }

    public void SetGap(Rect rect) => SetGap(rect, visible: true);

    public void Hide() => SetGap(Rect.Empty, visible: false);

    private void SetGap(Rect rect, bool visible)
    {
        _rect = visible ? rect : Rect.Empty;
        InvalidateVisual();
    }

    protected override void OnRender(DrawingContext drawingContext)
    {
        if (_rect.IsEmpty || _rect.Height < 4)
            return;

        drawingContext.DrawRoundedRectangle(_fill, null, _rect, 8, 8);
        drawingContext.DrawRoundedRectangle(null, _pen, _rect, 8, 8);
    }
}
