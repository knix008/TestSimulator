using SVGEditorWinV10.Models;
using SVGEditorWinV10.Rendering;
using SVGEditorWinV10.Serialization;
using SVGEditorWinV10.Ui;

namespace SVGEditorWinV10.Controls;

public sealed partial class SvgCanvas
{
    private static bool IsPathDrawingTool(EditorTool tool) =>
        tool is EditorTool.Polygon or EditorTool.Curve;

    private PointF GetPathDragPoint(PointF canvasPoint) =>
        _penSession.Mode == PathDrawMode.Curve
            ? canvasPoint
            : EditorCanvasGrid.SnapPoint(canvasPoint);

    private void HandlePenMouseDown(PointF canvasPoint, int clickCount)
    {
        Focus();
        var point = EditorCanvasGrid.SnapPoint(canvasPoint);

        // Check if clicking on an existing committed curve control handle
        if (_penSession.IsActive && _penSession.Mode == PathDrawMode.Curve)
        {
            var hitIdx = _penSession.HitTestCommittedHandle(canvasPoint, HandleSize * 1.5f);
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

        if (_penSession.IsActive && _penSession.IsNearFirstPoint(point, 10f / _zoom))
        {
            FinishPenPath(closed: true);
            return;
        }

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
        var closeTolerance = 10f / _zoom;
        var committedData = _penSession.GetCommittedPathData();
        if (!string.IsNullOrWhiteSpace(committedData))
        {
            var committed = CreatePenPathElement(committedData, fillOpacity: 0f);
            SvgPathRenderer.Draw(graphics, committed);
        }

        if (_penSession.Mode == PathDrawMode.Curve && _penSession.IsActive)
            DrawCurveDragGuides(graphics);

        var pendingData = _penSession.GetPendingPathData(_penPreviewPoint, closeTolerance);
        if (string.IsNullOrWhiteSpace(pendingData))
            return;

        var wouldClose = _penSession.PreviewWouldClose(_penPreviewPoint, closeTolerance);
        var pending = CreatePenPathElement(pendingData, wouldClose ? _defaultFillOpacity : 0f);
        SvgPathRenderer.DrawPreview(graphics, pending, showClosedFill: wouldClose);
    }

    private void DrawCurveDragGuides(Graphics graphics)
    {
        DrawCommittedSegmentHandles(graphics);
    }

    private void DrawCommittedSegmentHandles(Graphics graphics)
    {
        var handles = _penSession.GetCommittedSegmentHandles();
        if (handles.Count == 0)
            return;

        var handleSize = HandleSize / _zoom;
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

        var handle = SvgPathEditHandles.HitTest(_primarySelected.PathData, canvasPoint, HandleSize);
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

        _primarySelected.PathData = SvgPathCommands.UpdateHandle(_pathEditStartData, _activePathHandle.Value, point);
        _primarySelected.Bounds = SvgPathParser.GetBounds(_primarySelected.PathData);
    }

    private static void SnapPathElement(SvgElement element)
    {
        if (element.Kind != SvgElementKind.Path || string.IsNullOrWhiteSpace(element.PathData))
            return;

        element.Bounds = SvgPathParser.GetBounds(element.PathData);
    }
}
