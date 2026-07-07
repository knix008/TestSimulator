namespace DCMViewer;

using System.Drawing.Drawing2D;

/// <summary>
/// 이미지 뷰포트 패널. 스크롤바 없이 PictureBox 위치로 패닝합니다.
/// </summary>
internal sealed class ImageScrollPanel : Panel
{
    private bool _panning;
    private Point _panStartMouse;
    private Point _panStartLocation;

    public Action<MouseEventArgs>? ZoomWheel { get; set; }

    public Func<bool>? CanPan { get; set; }

    public Func<Point>? GetImageLocation { get; set; }

    public Action<Point>? SetImageLocation { get; set; }

    public void AttachPanTarget(Control control)
    {
        control.MouseDown += OnPanMouseDown;
        control.MouseMove += OnPanMouseMove;
        control.MouseUp += OnPanMouseUp;
        control.MouseLeave += OnPanMouseLeave;
    }

    protected override void OnMouseDown(MouseEventArgs e) => OnPanMouseDown(this, e);

    protected override void OnMouseMove(MouseEventArgs e) => OnPanMouseMove(this, e);

    protected override void OnMouseUp(MouseEventArgs e) => OnPanMouseUp(this, e);

    protected override void OnMouseLeave(EventArgs e) => OnPanMouseLeave(this, e);

    protected override void OnMouseWheel(MouseEventArgs e)
    {
        if (ZoomWheel is not null)
        {
            ZoomWheel(e);
            return;
        }

        base.OnMouseWheel(e);
    }

    private bool IsPannable() => CanPan?.Invoke() == true;

    private void OnPanMouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left || !IsPannable() || GetImageLocation is null || SetImageLocation is null)
            return;

        _panning = true;
        _panStartMouse = PointToClient(Control.MousePosition);
        _panStartLocation = GetImageLocation();
        Cursor = Cursors.SizeAll;

        if (sender is Control control)
            control.Capture = true;
    }

    private void OnPanMouseMove(object? sender, MouseEventArgs e)
    {
        if (_panning && SetImageLocation is not null)
        {
            var currentMouse = PointToClient(Control.MousePosition);
            var dx = currentMouse.X - _panStartMouse.X;
            var dy = currentMouse.Y - _panStartMouse.Y;
            SetImageLocation(new Point(_panStartLocation.X + dx, _panStartLocation.Y + dy));
            return;
        }

        UpdatePanCursor();
    }

    private void OnPanMouseUp(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left)
            return;

        _panning = false;

        if (sender is Control control)
            control.Capture = false;

        UpdatePanCursor();
    }

    private void OnPanMouseLeave(object? sender, EventArgs e)
    {
        if (_panning)
            return;

        UpdatePanCursor();
    }

    public void RefreshPanCursor() => UpdatePanCursor();

    private void UpdatePanCursor()
    {
        Cursor = IsPannable() ? Cursors.Hand : Cursors.Default;
    }
}

/// <summary>
/// PictureBox가 포커스를 받은 상태에서도 휠로 줌만 처리합니다.
/// 원본 비트맵을 매번 리샘플링하지 않고 OnPaint에서 확대/축소합니다.
/// </summary>
internal sealed class ZoomPictureBox : PictureBox
{
    public Action<MouseEventArgs>? ZoomWheel { get; set; }

    public InterpolationMode InterpolationMode { get; set; } = InterpolationMode.HighQualityBicubic;

    public ZoomPictureBox()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer, true);
        SizeMode = PictureBoxSizeMode.Normal;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        if (Image is null)
        {
            e.Graphics.Clear(BackColor);
            return;
        }

        e.Graphics.InterpolationMode = InterpolationMode;
        e.Graphics.PixelOffsetMode = PixelOffsetMode.Half;
        e.Graphics.DrawImage(Image, ClientRectangle);
    }

    protected override void OnMouseWheel(MouseEventArgs e)
    {
        if (ZoomWheel is not null)
        {
            ZoomWheel(e);
            return;
        }

        base.OnMouseWheel(e);
    }
}
