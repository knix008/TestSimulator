using SVGEditorWinV10.Models;
using SVGEditorWinV10.Serialization;

namespace SVGEditorWinV10.Controls;

internal sealed class SvgPenToolSession
{
    private const float CloseTolerance = 10f;
    private const float CurveDragThreshold = 4f;

    private readonly List<SvgPathSegment> _segments = [];
    private PointF _clickDown;
    private PointF _dragCurrent;
    private PointF _dragPeak;
    private bool _isDragging;

    public bool IsActive => _segments.Count > 0;
    public bool IsDragging => _isDragging;
    public bool HasPreview => _isDragging || IsActive;

    public void Reset()
    {
        _segments.Clear();
        _isDragging = false;
    }

    public bool IsNearFirstPoint(PointF point, float tolerance = CloseTolerance) =>
        IsActive && Distance(_segments[0].End, point) <= tolerance;

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

        _dragCurrent = point;
        if (Distance(_dragPeak, _clickDown) < Distance(point, _clickDown))
            _dragPeak = point;
    }

    public void CommitPoint()
    {
        if (!_isDragging)
            return;

        _isDragging = false;
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
        if (!IsActive || _segments.Any(static s => s.Kind == SvgPathSegmentKind.Close))
            return;

        _segments.Add(new SvgPathSegment { Kind = SvgPathSegmentKind.Close, End = _segments[0].End });
    }

    public string GetPreviewPathData(PointF cursor, float closeTolerance = CloseTolerance)
    {
        if (!_isDragging && !IsActive)
            return string.Empty;

        var preview = IsActive
            ? _segments.Select(static s => new SvgPathSegment
            {
                Kind = s.Kind,
                End = s.End,
                Control1 = s.Control1,
                Control2 = s.Control2
            }).ToList()
            : new List<SvgPathSegment>();

        var target = _isDragging ? _dragCurrent : cursor;

        if (_isDragging)
        {
            if (!IsActive)
            {
                if (Distance(_clickDown, target) < 0.5f)
                    return string.Empty;

                preview.Add(new SvgPathSegment { Kind = SvgPathSegmentKind.Move, End = _clickDown });
            }

            if (Distance(_clickDown, _dragPeak) >= CurveDragThreshold)
            {
                preview.Add(new SvgPathSegment
                {
                    Kind = SvgPathSegmentKind.Quadratic,
                    Control1 = _dragPeak,
                    End = target
                });
            }
            else if (IsActive || Distance(_clickDown, target) >= 0.5f)
            {
                preview.Add(new SvgPathSegment { Kind = SvgPathSegmentKind.Line, End = target });
            }
        }
        else if (preview.Count > 0 && preview[^1].Kind != SvgPathSegmentKind.Close)
        {
            preview.Add(new SvgPathSegment { Kind = SvgPathSegmentKind.Line, End = target });

            if (IsNearFirstPoint(target, closeTolerance) && preview.Count >= 3)
                preview.Add(new SvgPathSegment { Kind = SvgPathSegmentKind.Close, End = preview[0].End });
        }

        return SvgPathCommands.ToPathData(preview);
    }

    public bool PreviewWouldClose(PointF cursor, float closeTolerance) =>
        IsActive && !_isDragging && IsNearFirstPoint(cursor, closeTolerance) && _segments.Count >= 2;

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

    private static float Distance(PointF a, PointF b)
    {
        var dx = a.X - b.X;
        var dy = a.Y - b.Y;
        return MathF.Sqrt(dx * dx + dy * dy);
    }
}
