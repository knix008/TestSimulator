using SVGEditorWinV10.Models;
using SVGEditorWinV10.Serialization;

namespace SVGEditorWinV10.Controls;

internal enum PathDrawMode
{
    Polygon,
    Curve
}

internal sealed class SvgPenToolSession
{
    private const float CloseTolerance = 10f;

    private readonly List<SvgPathSegment> _segments = [];
    private PointF _clickDown;
    private bool _isDragging;
    private bool _isEditingHandle;
    private int _editingSegmentIndex = -1;

    public PathDrawMode Mode { get; set; } = PathDrawMode.Polygon;

    public bool IsActive => _segments.Count > 0;
    public bool IsDragging => _isDragging;
    public bool IsEditingHandle => _isEditingHandle;
    public bool ShouldDrawInProgress => IsActive || IsDragging;
    public PointF FirstAnchorPoint => _segments.Count > 0 ? _segments[0].End : PointF.Empty;

    public void Reset()
    {
        _segments.Clear();
        _isDragging = false;
        _isEditingHandle = false;
        _editingSegmentIndex = -1;
    }

    public bool IsNearFirstPoint(PointF point, float tolerance = CloseTolerance) =>
        IsActive && Distance(_segments[0].End, point) <= tolerance;

    public void BeginDrag(PointF point)
    {
        _clickDown = point;
        _isDragging = true;
    }

    public void UpdateDrag(PointF point)
    {
        _ = point;
    }

    public void CommitPoint()
    {
        if (!_isDragging)
            return;

        _isDragging = false;

        if (!IsActive)
        {
            _segments.Add(new SvgPathSegment { Kind = SvgPathSegmentKind.Move, End = _clickDown });
            return;
        }

        _segments.Add(new SvgPathSegment
        {
            Kind = SvgPathSegmentKind.Line,
            End = _clickDown
        });
    }

    public void ClosePath()
    {
        if (!IsActive || _segments.Any(s => s.Kind == SvgPathSegmentKind.Close))
            return;

        var first = _segments[0].End;
        var last = GetLastAnchorPoint();
        if (_segments.Count >= 2 && Distance(last, first) > 0.01f)
            _segments.Add(new SvgPathSegment { Kind = SvgPathSegmentKind.Line, End = first });

        _segments.Add(new SvgPathSegment { Kind = SvgPathSegmentKind.Close, End = first });
    }

    public string GetCommittedPathData() =>
        IsActive ? SvgPathCommands.ToPathData(_segments) : string.Empty;

    public string GetPendingPathData(PointF cursor, float closeTolerance = CloseTolerance)
    {
        if (_isDragging)
        {
            if (!IsActive)
                return string.Empty;

            var pending = new List<SvgPathSegment> { CreateMoveFromLastPoint() };
            AppendPendingSegment(pending, _clickDown);

            if (IsNearFirstPoint(_clickDown, closeTolerance) && _segments.Count >= 2)
                pending.Add(new SvgPathSegment { Kind = SvgPathSegmentKind.Close, End = _segments[0].End });

            return SvgPathCommands.ToPathData(pending);
        }

        if (IsActive && !_isDragging && !_isEditingHandle && _segments[^1].Kind != SvgPathSegmentKind.Close)
        {
            var pending = new List<SvgPathSegment> { CreateMoveFromLastPoint() };
            AppendRubberBandSegment(pending, cursor);

            if (IsNearFirstPoint(cursor, closeTolerance) && _segments.Count >= 2)
                pending.Add(new SvgPathSegment { Kind = SvgPathSegmentKind.Close, End = _segments[0].End });

            return SvgPathCommands.ToPathData(pending);
        }

        return string.Empty;
    }

    private SvgPathSegment CreateMoveFromLastPoint()
    {
        return new SvgPathSegment { Kind = SvgPathSegmentKind.Move, End = GetLastAnchorPoint() };
    }

    public string GetDrawingPathData(PointF cursor, float closeTolerance = CloseTolerance)
    {
        if (!ShouldDrawInProgress)
            return string.Empty;

        var drawing = _segments.Select(segment => new SvgPathSegment
        {
            Kind = segment.Kind,
            End = segment.End,
            Control1 = segment.Control1,
            Control2 = segment.Control2
        }).ToList();

        if (_isDragging && IsActive)
        {
            AppendPendingSegment(drawing, _clickDown);

            if (IsNearFirstPoint(_clickDown, closeTolerance) && drawing.Count >= 3)
                drawing.Add(new SvgPathSegment { Kind = SvgPathSegmentKind.Close, End = drawing[0].End });
        }
        else if (IsActive && drawing.Count > 0 && drawing[^1].Kind != SvgPathSegmentKind.Close)
        {
            AppendRubberBandSegment(drawing, cursor);

            if (IsNearFirstPoint(cursor, closeTolerance) && drawing.Count >= 3)
                drawing.Add(new SvgPathSegment { Kind = SvgPathSegmentKind.Close, End = drawing[0].End });
        }

        return SvgPathCommands.ToPathData(drawing);
    }

    public bool PreviewWouldClose(PointF cursor, float closeTolerance)
    {
        if (!IsActive || _isDragging)
            return false;

        return IsNearFirstPoint(cursor, closeTolerance) && _segments.Count >= 2;
    }

    public PointF? GetCurveDragGuides(out PointF control, out PointF end)
    {
        control = default;
        end = default;

        return null;
    }

    public IReadOnlyList<(int SegmentIndex, PointF Start, PointF Control, PointF End)> GetCommittedSegmentHandles()
    {
        if (!IsActive || Mode != PathDrawMode.Curve)
            return [];

        var result = new List<(int, PointF, PointF, PointF)>();
        for (var i = 1; i < _segments.Count; i++)
        {
            var segment = _segments[i];
            if (segment.Kind != SvgPathSegmentKind.Quadratic && segment.Kind != SvgPathSegmentKind.Line)
                continue;

            var start = SvgPathCommands.GetSegmentStart(_segments, i);
            var control = segment.Kind == SvgPathSegmentKind.Quadratic
                ? SvgPathCommands.GetQuadraticMidpoint(start, segment.Control1, segment.End)
                : new PointF((start.X + segment.End.X) / 2f, (start.Y + segment.End.Y) / 2f);

            result.Add((i, start, control, segment.End));
        }

        return result;
    }

    public int HitTestCommittedHandle(PointF point, float tolerance)
    {
        foreach (var (segIdx, _, control, _) in GetCommittedSegmentHandles())
        {
            if (Distance(control, point) <= tolerance)
                return segIdx;
        }

        return -1;
    }

    public void BeginHandleDrag(int segmentIndex)
    {
        _editingSegmentIndex = segmentIndex;
        _isEditingHandle = true;
        _isDragging = false;
    }

    public void UpdateHandleDrag(PointF point)
    {
        if (!_isEditingHandle || _editingSegmentIndex < 0 || _editingSegmentIndex >= _segments.Count)
            return;

        var segment = _segments[_editingSegmentIndex];
        if (segment.Kind == SvgPathSegmentKind.Quadratic)
        {
            var start = SvgPathCommands.GetSegmentStart(_segments, _editingSegmentIndex);
            segment.Control1 = SvgPathCommands.GetQuadraticControlFromMidpoint(start, point, segment.End);
        }
        else if (segment.Kind == SvgPathSegmentKind.Line)
        {
            var start = SvgPathCommands.GetSegmentStart(_segments, _editingSegmentIndex);
            _segments[_editingSegmentIndex] = new SvgPathSegment
            {
                Kind = SvgPathSegmentKind.Quadratic,
                End = segment.End,
                Control1 = SvgPathCommands.GetQuadraticControlFromMidpoint(start, point, segment.End)
            };
        }
    }

    public void CommitHandleDrag()
    {
        _isEditingHandle = false;
        _editingSegmentIndex = -1;
    }

    private PointF GetLastAnchorPoint()
    {
        var last = _segments[^1];
        return last.Kind == SvgPathSegmentKind.Close ? _segments[0].End : last.End;
    }

    public SvgElement? Finish(
        bool closed,
        Color fillColor,
        FillPattern fillPattern,
        float fillOpacity,
        Color strokeColor,
        float strokeOpacity,
        float strokeWidth,
        StrokeLineStyle strokeLineStyle)
    {
        if (!IsActive)
            return null;

        if (closed)
            ClosePath();

        var pathData = SvgPathCommands.ToPathData(_segments);
        if (string.IsNullOrWhiteSpace(pathData))
            return null;

        var bounds = SvgPathCommands.GetBounds(_segments);
        if (bounds.Width < 1f && bounds.Height < 1f)
            return null;

        Reset();
        return new SvgElement
        {
            Kind = SvgElementKind.Path,
            PathData = pathData,
            Bounds = bounds,
            FillColor = fillColor,
            FillPattern = fillPattern,
            FillOpacity = closed ? fillOpacity : 0f,
            StrokeColor = strokeColor,
            StrokeOpacity = strokeOpacity,
            StrokeWidth = strokeWidth,
            StrokeLineStyle = strokeLineStyle,
            FillRule = closed ? SvgFillRule.NonZero : SvgFillRule.NonZero
        };
    }

    private void AppendPendingSegment(List<SvgPathSegment> drawing, PointF end)
    {
        drawing.Add(new SvgPathSegment { Kind = SvgPathSegmentKind.Line, End = end });
    }

    private void AppendRubberBandSegment(List<SvgPathSegment> drawing, PointF end)
    {
        drawing.Add(new SvgPathSegment { Kind = SvgPathSegmentKind.Line, End = end });
    }

    private static PointF GetSegmentMidpoint(PointF start, PointF end) =>
        new((start.X + end.X) / 2f, (start.Y + end.Y) / 2f);

    private static float Distance(PointF a, PointF b)
    {
        var dx = a.X - b.X;
        var dy = a.Y - b.Y;
        return MathF.Sqrt(dx * dx + dy * dy);
    }
}
