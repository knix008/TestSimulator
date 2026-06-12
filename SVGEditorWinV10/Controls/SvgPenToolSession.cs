using SVGEditorWinV10.Models;
using SVGEditorWinV10.Serialization;
using SVGEditorWinV10.Ui;

namespace SVGEditorWinV10.Controls;

internal enum PathDrawMode
{
    Polygon,
    Polyline,
    Curve,
    AdjustablePath
}

internal sealed class SvgPenToolSession
{
    private const float CloseTolerance = 10f;
    private const float CurveDragThreshold = 4f;

    private readonly List<SvgPathSegment> _segments = [];
    private PointF _clickDown;
    private PointF _dragCurrent;
    private PointF _dragPeak;
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

    public bool CanClosePath() => _segments.Count >= 2;

    public static float GetCloseTolerance(float zoom) =>
        Math.Max(CloseTolerance / Math.Max(zoom, 0.1f), EditorCanvasGrid.MinorGrid * 0.75f);

    public bool ShouldClosePolygonAt(PointF canvasPoint, PointF snappedPoint, float tolerance) =>
        Mode == PathDrawMode.Polygon
        && CanClosePath()
        && (IsNearFirstPoint(snappedPoint, tolerance) || IsNearFirstPoint(canvasPoint, tolerance));

    public bool ShouldCloseCurveAt(PointF canvasPoint, PointF snappedPoint, float tolerance) =>
        Mode == PathDrawMode.Curve
        && CanClosePath()
        && (IsNearFirstPoint(snappedPoint, tolerance) || IsNearFirstPoint(canvasPoint, tolerance));

    public void BeginDrag(PointF point)
    {
        _clickDown = point;
        _dragCurrent = point;
        _dragPeak = point;
        _isDragging = true;
    }

    public void UpdateDrag(PointF point)
    {
        if (!_isDragging)
            return;

        if (Mode == PathDrawMode.Curve)
        {
            _dragCurrent = point;
            if (Distance(_dragPeak, _clickDown) < Distance(point, _clickDown))
                _dragPeak = point;
        }
    }

    public void CommitPoint()
    {
        if (!_isDragging)
            return;

        _isDragging = false;

        if (Mode == PathDrawMode.Curve)
            CommitCurvePoint();
        else
            CommitStraightPoint(_clickDown);
    }

    private void CommitStraightPoint(PointF end)
    {
        if (!IsActive)
        {
            _segments.Add(new SvgPathSegment { Kind = SvgPathSegmentKind.Move, End = end });
            return;
        }

        _segments.Add(new SvgPathSegment
        {
            Kind = SvgPathSegmentKind.Line,
            End = end
        });
    }

    private void CommitCurvePoint()
    {
        var end = _dragCurrent;

        if (!IsActive)
        {
            _segments.Add(new SvgPathSegment { Kind = SvgPathSegmentKind.Move, End = end });
            return;
        }

        if (Distance(_clickDown, _dragPeak) >= CurveDragThreshold)
        {
            _segments.Add(new SvgPathSegment
            {
                Kind = SvgPathSegmentKind.Quadratic,
                Control1 = _dragPeak,
                End = end
            });
        }
        else
        {
            _segments.Add(new SvgPathSegment
            {
                Kind = SvgPathSegmentKind.Line,
                End = end
            });
        }
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

        if (_isDragging)
        {
            if (Mode == PathDrawMode.Curve)
                AppendCurveDragPreview(drawing);
            else if (IsActive)
                drawing.Add(new SvgPathSegment { Kind = SvgPathSegmentKind.Line, End = _clickDown });

            if (IsNearFirstPoint(Mode == PathDrawMode.Curve ? _dragCurrent : _clickDown, closeTolerance) && drawing.Count >= 3)
                drawing.Add(new SvgPathSegment { Kind = SvgPathSegmentKind.Close, End = drawing[0].End });
        }
        else if (IsActive && drawing.Count > 0 && drawing[^1].Kind != SvgPathSegmentKind.Close)
        {
            drawing.Add(new SvgPathSegment { Kind = SvgPathSegmentKind.Line, End = cursor });

            if (IsNearFirstPoint(cursor, closeTolerance) && drawing.Count >= 3)
                drawing.Add(new SvgPathSegment { Kind = SvgPathSegmentKind.Close, End = drawing[0].End });
        }

        return SvgPathCommands.ToPathData(drawing);
    }

    private void AppendCurveDragPreview(List<SvgPathSegment> drawing)
    {
        if (!IsActive)
        {
            if (Distance(_clickDown, _dragCurrent) < 0.5f)
                return;

            drawing.Add(new SvgPathSegment { Kind = SvgPathSegmentKind.Move, End = _clickDown });
        }

        if (Distance(_clickDown, _dragPeak) >= CurveDragThreshold)
        {
            drawing.Add(new SvgPathSegment
            {
                Kind = SvgPathSegmentKind.Quadratic,
                Control1 = _dragPeak,
                End = _dragCurrent
            });
        }
        else if (IsActive || Distance(_clickDown, _dragCurrent) >= 0.5f)
        {
            drawing.Add(new SvgPathSegment { Kind = SvgPathSegmentKind.Line, End = _dragCurrent });
        }
    }

    public bool PreviewWouldClose(PointF cursor, float closeTolerance)
    {
        if (!IsActive || _isDragging || Mode is PathDrawMode.Polyline or PathDrawMode.AdjustablePath)
            return false;

        return CanClosePath() && IsNearFirstPoint(cursor, closeTolerance);
    }

    public IReadOnlyList<(int SegmentIndex, PointF Start, PointF Control, PointF End)> GetCommittedSegmentHandles()
    {
        if (!IsActive || Mode != PathDrawMode.AdjustablePath)
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

        var nativePathKind = Mode switch
        {
            PathDrawMode.Polygon => SvgNativePathKind.Polygon,
            PathDrawMode.Polyline => SvgNativePathKind.Polyline,
            PathDrawMode.AdjustablePath or PathDrawMode.Curve => SvgNativePathKind.Path,
            _ => SvgNativePathKind.Path
        };

        Reset();
        return new SvgElement
        {
            Kind = SvgElementKind.Path,
            PathData = pathData,
            Bounds = bounds,
            NativePathKind = nativePathKind,
            FillColor = fillColor,
            FillPattern = fillPattern,
            FillOpacity = closed && Mode != PathDrawMode.Polyline ? fillOpacity : 0f,
            StrokeColor = strokeColor,
            StrokeOpacity = strokeOpacity,
            StrokeWidth = strokeWidth,
            StrokeLineStyle = strokeLineStyle,
            FillRule = SvgFillRule.NonZero
        };
    }

    private static float Distance(PointF a, PointF b)
    {
        var dx = a.X - b.X;
        var dy = a.Y - b.Y;
        return MathF.Sqrt(dx * dx + dy * dy);
    }
}
