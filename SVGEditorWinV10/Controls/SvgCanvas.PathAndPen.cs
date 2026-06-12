using SVGEditorWinV10.Models;
using SVGEditorWinV10.Rendering;
using SVGEditorWinV10.Serialization;
using SVGEditorWinV10.Ui;

namespace SVGEditorWinV10.Controls;

public sealed partial class SvgCanvas
{
    private void HandlePenMouseDown(PointF canvasPoint, int clickCount)
    {
        Focus();
        var point = EditorCanvasGrid.SnapPoint(canvasPoint);

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
        var pathData = _penSession.GetPreviewPathData(_penPreviewPoint, closeTolerance);
        if (string.IsNullOrWhiteSpace(pathData))
            return;

        var wouldClose = _penSession.PreviewWouldClose(_penPreviewPoint, closeTolerance);
        var preview = new SvgElement
        {
            Kind = SvgElementKind.Path,
            PathData = pathData,
            FillColor = _defaultFill,
            FillPattern = _defaultFillPattern,
            FillOpacity = wouldClose ? _defaultFillOpacity : 0f,
            StrokeColor = _defaultStroke,
            StrokeOpacity = _defaultStrokeOpacity,
            StrokeWidth = _defaultStrokeWidth,
            StrokeLineStyle = _defaultStrokeLineStyle
        };
        SvgPathRenderer.DrawPreview(graphics, preview, showClosedFill: wouldClose);
    }

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
