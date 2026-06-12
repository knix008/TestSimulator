using SVGEditorWinV10.Models;
using SVGEditorWinV10.Rendering;
using SVGEditorWinV10.Serialization;
using SVGEditorWinV10.Ui;

namespace SVGEditorWinV10.Controls;

public sealed partial class SvgCanvas
{
    private static bool IsPathDrawingTool(EditorTool tool) =>
        tool is EditorTool.Polygon or EditorTool.Polyline or EditorTool.Curve or EditorTool.Path;

    private PointF GetPathDragPoint(PointF canvasPoint) =>
        _penSession.IsEditingHandle
            ? canvasPoint
            : EditorCanvasGrid.SnapPoint(canvasPoint);

    private float ClosePathTolerance => SvgPenToolSession.GetCloseTolerance(_zoom);

    private bool TryFinishClosedPolygon(PointF canvasPoint, PointF snappedPoint)
    {
        if (!_penSession.ShouldClosePolygonAt(canvasPoint, snappedPoint, ClosePathTolerance))
            return false;

        FinishPenPath(closed: true);
        return true;
    }

    private bool TryFinishClosedCurve(PointF canvasPoint, PointF snappedPoint)
    {
        if (!_penSession.ShouldCloseCurveAt(canvasPoint, snappedPoint, ClosePathTolerance))
            return false;

        FinishPenPath(closed: true);
        return true;
    }

    private void HandlePenMouseDown(PointF canvasPoint, int clickCount)
    {
        Focus();
        var point = EditorCanvasGrid.SnapPoint(canvasPoint);

        if (_penSession.IsActive && _penSession.Mode == PathDrawMode.AdjustablePath)
        {
            var hitIdx = _penSession.HitTestCommittedHandle(canvasPoint, Math.Max(HandleSize * 3f, 12f / _zoom));
            if (hitIdx >= 0)
            {
                _penSession.BeginHandleDrag(hitIdx);
                Capture = true;
                Invalidate();
                return;
            }
        }

        if (clickCount >= 2 && _penSession.IsActive)
        {
            FinishPenPath(closed: false);
            return;
        }

        if (TryFinishClosedPolygon(canvasPoint, point))
            return;

        if (TryFinishClosedCurve(canvasPoint, point))
            return;

        _closePathAfterPenDrag = false;
        _penPreviewPoint = point;
        _penSession.BeginDrag(point);
        Capture = true;
        Invalidate();
    }

    private void FinishPenPath(bool closed)
    {
        Capture = false;
        var created = _penSession.Finish(
            closed,
            _defaultFill,
            _defaultFillPattern,
            _defaultFillOpacity,
            _defaultStroke,
            _defaultStrokeOpacity,
            _defaultStrokeWidth,
            _defaultStrokeLineStyle);
        _closePathAfterPenDrag = false;
        if (created is null)
            return;

        _document.Elements.Add(created);
        SetSingleSelection(created);
        ElementCreated?.Invoke(this, EventArgs.Empty);
        DocumentChanged?.Invoke(this, EventArgs.Empty);
        Invalidate();
    }

    private void DrawPenPreview(Graphics graphics)
    {
        var closeTolerance = ClosePathTolerance;
        var drawingData = _penSession.GetDrawingPathData(_penPreviewPoint, closeTolerance);
        if (string.IsNullOrWhiteSpace(drawingData))
            return;

        var wouldClose = !_penSession.IsDragging && _penSession.PreviewWouldClose(_penPreviewPoint, closeTolerance);
        var element = CreatePenPathElement(drawingData, wouldClose ? _defaultFillOpacity : 0f);

        if (_penSession.IsDragging)
            SvgPathRenderer.Draw(graphics, element);
        else
            SvgPathRenderer.DrawPreview(graphics, element, showClosedFill: wouldClose);

        if (_penSession.Mode == PathDrawMode.AdjustablePath && _penSession.IsActive)
            DrawAdjustablePathHandles(graphics);
    }

    private void DrawAdjustablePathHandles(Graphics graphics)
    {
        var handles = _penSession.GetCommittedSegmentHandles();
        if (handles.Count == 0)
            return;

        var handleSize = HandleSize;
        using var guidePen = new Pen(Color.FromArgb(120, 234, 88, 12), 1f / _zoom)
        {
            DashStyle = System.Drawing.Drawing2D.DashStyle.Dot
        };
        using var controlFill = new SolidBrush(Color.FromArgb(200, 254, 243, 229));
        using var controlBorder = new Pen(Color.FromArgb(234, 88, 12), 1f / _zoom);

        foreach (var (_, segStart, control, segEnd) in handles)
        {
            graphics.DrawLine(guidePen, segStart.X, segStart.Y, control.X, control.Y);
            graphics.DrawLine(guidePen, control.X, control.Y, segEnd.X, segEnd.Y);
            graphics.FillEllipse(controlFill, control.X - handleSize / 2f, control.Y - handleSize / 2f, handleSize, handleSize);
            graphics.DrawEllipse(controlBorder, control.X - handleSize / 2f, control.Y - handleSize / 2f, handleSize, handleSize);
        }
    }

    private SvgElement CreatePenPathElement(string pathData, float fillOpacity) =>
        new SvgElement
        {
            Kind = SvgElementKind.Path,
            PathData = pathData,
            FillColor = _defaultFill,
            FillPattern = _defaultFillPattern,
            FillOpacity = fillOpacity,
            StrokeColor = _defaultStroke,
            StrokeOpacity = _defaultStrokeOpacity,
            StrokeWidth = _defaultStrokeWidth,
            StrokeLineStyle = _defaultStrokeLineStyle
        };

    private bool TryBeginPathEdit(PointF canvasPoint)
    {
        if (_tool != EditorTool.Select
            || _primarySelected?.Kind != SvgElementKind.Path
            || _selectedIds.Count != 1
            || string.IsNullOrWhiteSpace(_primarySelected.PathData))
            return false;

        var handle = SvgPathEditHandles.HitTest(_primarySelected.PathData, canvasPoint, HandleSize, _primarySelected.NativePathKind);
        if (handle is null)
            return false;

        Focus();
        _isEditingPath = true;
        _activePathHandle = handle;
        _pathEditStartData = _primarySelected.PathData;
        Capture = true;
        Invalidate();
        UpdateCursor(canvasPoint);
        return true;
    }

    private void UpdatePathEdit(PointF point)
    {
        if (_primarySelected is null || _activePathHandle is null)
            return;

        var allowCurveControls = SvgPathCommands.AllowsCurveEditing(_primarySelected.NativePathKind);
        _primarySelected.PathData = SvgPathCommands.UpdateHandle(_pathEditStartData, _activePathHandle.Value, point, allowCurveControls);
        _primarySelected.Bounds = SvgPathParser.GetBounds(_primarySelected.PathData);
    }

    private static void SnapPathElement(SvgElement element)
    {
        if (element.Kind != SvgElementKind.Path || string.IsNullOrWhiteSpace(element.PathData))
            return;

        element.Bounds = SvgPathParser.GetBounds(element.PathData);
    }
}
