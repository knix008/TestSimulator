using System.Drawing.Imaging;
using MyDiagramWinV10.Controls;
using MyDiagramWinV10.Models;
using MyDiagramWinV10.Rendering;
using MyDiagramWinV10.Export;

namespace MyDiagramWinV10;

public partial class Diagram3DViewForm : Form
{
    private readonly DiagramProject _project;
    private Diagram3DScene _scene;

    private float _yaw = 0.55f;
    private float _pitch = -0.42f;
    private float _distance = 900f;

    private bool _isDraggingCamera;
    private bool _isDraggingShape;
    private bool _shiftPressed;

    private Point _dragStart;
    private float _dragStartYaw;
    private float _dragStartPitch;

    private Guid? _selectedShapeId;
    private float _dragStartShapeYawDeg;

    private const float ShapePickRadiusPx = 26f;

    public Diagram3DViewForm(DiagramProject project)
    {
        InitializeComponent();

        _project = project;
        _scene = Diagram3DBuilder.Build(_project);
        _viewPanel.Invalidate();
        UpdateStatus();
    }

    private void ViewPanel_Paint(object? sender, PaintEventArgs e)
    {
        Diagram3DRenderer.Draw(e.Graphics, _viewPanel.ClientRectangle, _scene, _yaw, _pitch, _distance);
        DrawSelectedMarker(e.Graphics);
    }

    private void ViewPanel_Resize(object? sender, EventArgs e) => _viewPanel.Invalidate();

    private void ViewPanel_MouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left)
            return;

        _viewPanel.Focus();
        _dragStart = e.Location;

        var hit = HitTestShape(e.Location);
        if (hit is not null)
        {
            _selectedShapeId = hit;
            _dragStartShapeYawDeg = GetSelectedShape()?.RotYawDeg ?? 0f;
            _isDraggingShape = true;
            _isDraggingCamera = false;
        }
        else
        {
            _selectedShapeId = null;
            _dragStartYaw = _yaw;
            _dragStartPitch = _pitch;
            _isDraggingCamera = true;
            _isDraggingShape = false;
        }

        _viewPanel.Capture = true;
        UpdateStatus();
    }

    private void ViewPanel_MouseMove(object? sender, MouseEventArgs e)
    {
        if (!_viewPanel.Capture)
            return;

        if (_isDraggingShape)
        {
            var shape = GetSelectedShape();
            if (shape is null)
                return;

            float dx = e.X - _dragStart.X;
            shape.RotYawDeg = _dragStartShapeYawDeg + dx * 0.35f;

            _scene = Diagram3DBuilder.Build(_project);
            _viewPanel.Invalidate();
            UpdateStatus();
            return;
        }

        if (_isDraggingCamera)
        {
            float dx = e.X - _dragStart.X;
            float dy = e.Y - _dragStart.Y;

            if (_shiftPressed)
            {
                _pitch = ClampPitch(_dragStartPitch + dy * 0.008f);
            }
            else
            {
                _yaw = _dragStartYaw + dx * 0.008f;
                _pitch = ClampPitch(_dragStartPitch + dy * 0.008f);
            }

            _viewPanel.Invalidate();
        }
    }

    private void ViewPanel_MouseUp(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left)
            return;

        _viewPanel.Capture = false;
        _isDraggingCamera = false;
        _isDraggingShape = false;
        UpdateStatus();
    }

    private void ViewPanel_MouseWheel(object? sender, MouseEventArgs e)
    {
        var factor = e.Delta > 0 ? 0.9f : 1.1f;
        _distance = Diagram3DRenderer.ClampDistance(_distance * factor);
        _viewPanel.Invalidate();
    }

    private void Diagram3DViewForm_KeyDown(object? sender, KeyEventArgs e)
    {
        if (e.KeyCode == Keys.ShiftKey)
            _shiftPressed = true;
    }

    private void Diagram3DViewForm_KeyUp(object? sender, KeyEventArgs e)
    {
        if (e.KeyCode == Keys.ShiftKey)
            _shiftPressed = false;
    }

    private void BtnResetView_Click(object? sender, EventArgs e)
    {
        _yaw = 0.55f;
        _pitch = -0.42f;
        _distance = 900f;
        _viewPanel.Invalidate();
        UpdateStatus();
    }

    private void DrawSelectedMarker(Graphics g)
    {
        var shape = GetSelectedShape();
        if (shape is null)
            return;

        var rect = _viewPanel.ClientRectangle;
        var center = new PointF(rect.Width / 2f, rect.Height / 2f);
        var focalLength = Math.Min(rect.Width, rect.Height) * 1.35f;
        var dist = Diagram3DRenderer.ClampDistance(_distance);

        var (centerX, centerZ) = GetSceneCenters();
        var pivotWorld = new Vec3(
            shape.X + shape.Width / 2f - centerX,
            0f,
            -(shape.Y + shape.Height / 2f - centerZ));

        var projected = ProjectPoint(pivotWorld, _yaw, _pitch, dist, focalLength, center);
        float radius = 7f;

        using var fill = new SolidBrush(Color.FromArgb(90, 0, 120, 255));
        using var pen = new Pen(Color.DodgerBlue, 2f);
        g.FillEllipse(fill, projected.X - radius, projected.Y - radius, radius * 2, radius * 2);
        g.DrawEllipse(pen, projected.X - radius, projected.Y - radius, radius * 2, radius * 2);
    }

    private void UpdateStatus()
    {
        if (_selectedShapeId is not null)
            _statusLabel.Text = "도형 선택됨: 왼쪽 드래그로 해당 도형 회전(Y축)";
        else
            _statusLabel.Text = "빈 공간: 왼쪽 드래그로 카메라 회전 | Shift+드래그: 기울이기 | 휠: 확대/축소";
    }

    private DiagramShape? GetSelectedShape()
        => _selectedShapeId is null
            ? null
            : _project.Shapes.FirstOrDefault(s => s.Id == _selectedShapeId);

    private (float centerX, float centerZ) GetSceneCenters()
    {
        var bounds = DiagramExporter.CalculateBounds(_project);
        var centerX = bounds.Left + bounds.Width / 2f;
        var centerZ = bounds.Top + bounds.Height / 2f;
        return (centerX, centerZ);
    }

    private Guid? HitTestShape(Point mouseClient)
    {
        var rect = _viewPanel.ClientRectangle;
        if (!rect.Contains(mouseClient))
            return null;

        var (centerX, centerZ) = GetSceneCenters();
        var center = new PointF(rect.Width / 2f, rect.Height / 2f);
        var focalLength = Math.Min(rect.Width, rect.Height) * 1.35f;
        var dist = Diagram3DRenderer.ClampDistance(_distance);

        Guid? bestId = null;
        float best = float.MaxValue;

        foreach (var shape in _project.Shapes)
        {
            var pivotWorld = new Vec3(
                shape.X + shape.Width / 2f - centerX,
                0f,
                -(shape.Y + shape.Height / 2f - centerZ));

            var projected = ProjectPoint(pivotWorld, _yaw, _pitch, dist, focalLength, center);

            float dx = projected.X - mouseClient.X;
            float dy = projected.Y - mouseClient.Y;
            float d = (float)Math.Sqrt(dx * dx + dy * dy);

            if (d < best)
            {
                best = d;
                bestId = shape.Id;
            }
        }

        return best <= ShapePickRadiusPx ? bestId : null;
    }

    private static PointF ProjectPoint(Vec3 point, float yaw, float pitch, float distance, float focalLength, PointF center)
    {
        var rotated = Rotate(point, yaw, pitch);
        float depth = rotated.Z + distance;
        if (Math.Abs(depth) < 1f)
            depth = 1f;

        float scale = focalLength / depth;
        return new PointF(
            center.X + rotated.X * scale,
            center.Y - rotated.Y * scale);
    }

    private static Vec3 Rotate(Vec3 point, float yaw, float pitch)
    {
        float cosY = (float)Math.Cos(yaw);
        float sinY = (float)Math.Sin(yaw);
        float x1 = point.X * cosY - point.Z * sinY;
        float z1 = point.X * sinY + point.Z * cosY;

        float cosX = (float)Math.Cos(pitch);
        float sinX = (float)Math.Sin(pitch);
        float y2 = point.Y * cosX - z1 * sinX;
        float z2 = point.Y * sinX + z1 * cosX;

        return new Vec3(x1, y2, z2);
    }

    private static float ClampPitch(float pitch) => Math.Clamp(pitch, -1.35f, 1.35f);
}

