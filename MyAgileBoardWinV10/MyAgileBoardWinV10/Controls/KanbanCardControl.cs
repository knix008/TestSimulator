using System.Drawing.Drawing2D;
using MyAgileBoardWinV10.Models;
using MyAgileBoardWinV10.Utils;

namespace MyAgileBoardWinV10.Controls;

public partial class KanbanCardControl : UserControl
{
    private enum HandleKind { None, Move, Rotate, BottomRight, Bottom, Right }

    private KanbanCard _card;
    private Font? _titleFont;
    private Point _dragStartScreen;
    private Point _grabOffset;
    private bool _isCrossColumnDragging;
    private bool _localCanvasMove;
    private bool _isSelected;
    private bool _mouseDownActive;
    private Point _canvasDragStartLocation;
    private HandleKind _activeHandle = HandleKind.None;
    private HandleKind _hoverHandle = HandleKind.None;
    private bool _isMouseOverCard;
    private int _mouseOverCount;
    private Point _transformStartScreen;
    private Size _transformStartSize;
    private float _transformStartRotation;
    private double _transformStartAngle;
    private Bitmap? _rotatedCache;

    public KanbanCard Card => _card;
    public bool IsSelected => _isSelected;
    public bool IsInteracting => Capture || _localCanvasMove || _isCrossColumnDragging
        || _activeHandle is HandleKind.Rotate or HandleKind.BottomRight or HandleKind.Bottom or HandleKind.Right;

    public event EventHandler<KanbanCard>? CardDoubleClicked;
    public event EventHandler<KanbanCard>? CardDeleted;
    public event EventHandler<KanbanCardControl>? CardSelected;
    public event EventHandler<KanbanCard>? CardBeforeTransform;
    public event EventHandler<KanbanCard>? CardTransformChanged;

    public event EventHandler<(KanbanCard Card, Point ScreenPos)>? CardDragStarted;
    public event EventHandler<(KanbanCard Card, Point ScreenPos)>? CardDragging;
    public event EventHandler<(KanbanCard Card, Point ScreenPos)>? CardDragEnded;
    public event EventHandler<CardZOrderAction>? CardZOrderRequested;

    public KanbanCardControl(KanbanCard card)
    {
        _card = card;
        InitializeComponent();
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);
        SetupIcons();
        UpdateDisplay();
        SetupDragSource();
    }

    public void SetSelected(bool selected)
    {
        if (_isSelected == selected) return;
        _isSelected = selected;
        Invalidate();
    }

    public void AdjustRotation(float delta)
    {
        if (Math.Abs(delta) < 0.01f) return;

        CardBeforeTransform?.Invoke(this, _card);
        _card.Rotation = Math.Clamp(_card.Rotation + delta,
            CardCanvasHelper.MinRotation, CardCanvasHelper.MaxRotation);
        InvalidateRotatedCache();
        Invalidate();
        CardTransformChanged?.Invoke(this, _card);
    }

    public void ResetRotation()
    {
        if (Math.Abs(_card.Rotation) < 0.01f) return;

        CardBeforeTransform?.Invoke(this, _card);
        _card.Rotation = 0f;
        InvalidateRotatedCache();
        Invalidate();
        CardTransformChanged?.Invoke(this, _card);
    }

    private void SetupIcons()
    {
        menuEdit.Image = Utils.IconFactory.Get("edit");
        menuDelete.Image = Utils.IconFactory.Get("delete");
    }

    public void UpdateDisplay()
    {
        var cardColor = _card.CardColor;
        BackColor = cardColor;
        panelCard.BackColor = cardColor;

        lblTitle.Text = _card.Title;
        CardTextHelper.ApplyStyleToCanvasLabel(lblTitle, _card.TitleStyle ?? new CardTextStyle(), _titleFont);
        _titleFont = lblTitle.Font;

        lblPriority.Text = _card.Points > 0
            ? $"{_card.Priority}  [{_card.Points}pt]"
            : _card.Priority.ToString();
        lblPriority.ForeColor = GetPriorityColor(_card.Priority);

        lblAssignee.Text = string.IsNullOrEmpty(_card.Assignee) ? string.Empty : $"\U0001f464 {_card.Assignee}";
        lblAssignee.Visible = !string.IsNullOrEmpty(_card.Assignee);

        if (_card.DueDate.HasValue)
        {
            bool overdue = _card.DueDate.Value.Date < DateTime.Today;
            lblDueDate.Text = $"\U0001f4c5 {_card.DueDate.Value:yyyy-MM-dd}";
            lblDueDate.ForeColor = overdue ? Color.Red : Color.DimGray;
            lblDueDate.Visible = true;
        }
        else
        {
            lblDueDate.Visible = false;
        }

        lblTags.Text = _card.Tags;
        lblTags.Visible = !string.IsNullOrEmpty(_card.Tags);

        ApplyCanvasLabelBackgrounds(cardColor);

        var descriptionText = CardTextHelper.ExtractPlainText(_card.DescriptionRtf, _card.Description);
        if (!string.IsNullOrEmpty(descriptionText))
        {
            toolTip.SetToolTip(this, descriptionText);
            toolTip.SetToolTip(panelCard, descriptionText);
            toolTip.SetToolTip(lblTitle, descriptionText);
        }
        else
        {
            toolTip.SetToolTip(this, string.Empty);
            toolTip.SetToolTip(panelCard, string.Empty);
            toolTip.SetToolTip(lblTitle, string.Empty);
        }

        InvalidateRotatedCache();
        ApplyContentLayout();
        Invalidate();
    }

    public void ApplyLayout(int columnMaxWidth)
    {
        var (width, fixedHeight) = _card.ResolveDisplaySize(columnMaxWidth);
        Margin = Padding.Empty;
        Width = width;

        int innerW = Math.Max(40, Width - 12);
        lblTitle.Width = innerW;
        lblTags.Width = innerW;
        lblTitle.AutoEllipsis = true;

        if (fixedHeight > 0)
        {
            Height = fixedHeight;
            LayoutForFixedHeight(fixedHeight);
        }
        else
        {
            LayoutForAutoHeight();
            AdjustHeight();
        }

        InvalidateRotatedCache();
    }

    private void LayoutForAutoHeight()
    {
        lblTitle.Height = Math.Min(36, Height - 20);
        lblTitle.Location = new Point(5, 4);
        lblPriority.Location = new Point(5, lblTitle.Bottom + 2);
        lblAssignee.Location = new Point(5, lblPriority.Bottom + 1);
        lblDueDate.Location = new Point(5, lblAssignee.Visible ? lblAssignee.Bottom + 1 : lblPriority.Bottom + 1);
        lblTags.Location = new Point(5, GetTagsTop());
    }

    private void LayoutForFixedHeight(int totalHeight)
    {
        bool compact = totalHeight < 82;
        bool medium = totalHeight < 105;

        if (compact)
        {
            lblAssignee.Visible = !string.IsNullOrEmpty(_card.Assignee) && totalHeight >= 78;
            lblDueDate.Visible = false;
            lblTags.Visible = false;
        }
        else if (medium)
        {
            lblAssignee.Visible = !string.IsNullOrEmpty(_card.Assignee);
            lblDueDate.Visible = _card.DueDate.HasValue;
            lblTags.Visible = false;
        }

        int bottomReserve = lblPriority.Visible ? 18 : 16;
        int titleH = Math.Max(18, totalHeight - bottomReserve - 8);
        if (!compact && lblAssignee.Visible) titleH = Math.Min(titleH, 36);
        lblTitle.Height = titleH;
        lblTitle.Location = new Point(5, 4);

        int metaY = totalHeight - 16;
        lblPriority.Location = new Point(5, metaY);
        lblAssignee.Location = new Point(5, Math.Min(metaY, lblTitle.Bottom + 2));
        lblDueDate.Location = new Point(5, lblAssignee.Bottom + 1);
        lblTags.Location = new Point(5, GetTagsTop());
    }

    private void ApplyContentLayout()
    {
        var (_, fixedHeight) = _card.ResolveDisplaySize(int.MaxValue);
        if (fixedHeight > 0)
            LayoutForFixedHeight(fixedHeight);
        else
        {
            LayoutForAutoHeight();
            AdjustHeight();
        }
    }

    private int GetTagsTop()
    {
        if (!lblTags.Visible) return lblTitle.Bottom;
        int y = lblTitle.Bottom + 2;
        if (lblAssignee.Visible) y = lblAssignee.Bottom + 1;
        else if (lblDueDate.Visible) y = lblDueDate.Bottom + 1;
        else if (lblPriority.Visible) y = lblPriority.Bottom + 1;
        return y;
    }

    private void AdjustHeight()
    {
        int h = lblTitle.Bottom + 4;
        if (lblPriority.Visible) h = Math.Max(h, lblPriority.Bottom + 4);
        if (lblAssignee.Visible) h = Math.Max(h, lblAssignee.Bottom + 4);
        if (lblDueDate.Visible) h = Math.Max(h, lblDueDate.Bottom + 4);
        if (lblTags.Visible) h = Math.Max(h, lblTags.Bottom + 4);
        Height = Math.Max(h, CardSizeDefaults.MinHeight);
    }

    private void ApplyCanvasLabelBackgrounds(Color cardColor)
    {
        lblTitle.BackColor = cardColor;
        lblPriority.BackColor = cardColor;
        lblAssignee.BackColor = cardColor;
        lblDueDate.BackColor = cardColor;
        lblTags.BackColor = cardColor;
    }

    private static Color GetPriorityColor(Priority p) => p switch
    {
        Priority.Critical => Color.Red,
        Priority.High => Color.OrangeRed,
        Priority.Medium => Color.DarkOrange,
        Priority.Low => Color.SeaGreen,
        _ => Color.Gray
    };

    private void SetupDragSource()
    {
        panelCard.Paint += PanelCard_StickyEffect;

        foreach (var ctrl in GetInteractiveControls())
        {
            ctrl.MouseDown += Card_MouseDown;
            ctrl.MouseMove += Card_MouseMove;
            ctrl.MouseUp += Card_MouseUp;
            ctrl.DoubleClick += OnCardDoubleClick;
            ctrl.MouseEnter += Card_MouseEnter;
            ctrl.MouseLeave += Card_MouseLeave;
        }

        MouseDown += Card_MouseDown;
        MouseMove += Card_MouseMove;
        MouseUp += Card_MouseUp;
        DoubleClick += OnCardDoubleClick;
        MouseEnter += Card_MouseEnter;
        MouseLeave += Card_MouseLeave;
    }

    private void Card_MouseEnter(object? sender, EventArgs e)
    {
        _mouseOverCount++;
        _isMouseOverCard = true;
        Invalidate();
    }

    private void Card_MouseLeave(object? sender, EventArgs e)
    {
        _mouseOverCount = Math.Max(0, _mouseOverCount - 1);
        if (_mouseOverCount == 0)
        {
            _isMouseOverCard = false;
            if (!Capture && !_mouseDownActive)
                UpdateHoverHandle(HandleKind.None);
        }
        Invalidate();
    }

    private IEnumerable<Control> GetInteractiveControls()
    {
        yield return panelCard;
        yield return lblTitle;
        yield return lblPriority;
        yield return lblAssignee;
        yield return lblDueDate;
        yield return lblTags;
    }

    private Point GetLocalPoint(Point clientPoint)
        => CardCanvasHelper.TransformPointToLocal(clientPoint, Width, Height, _card.Rotation);

    private HandleKind HitTestHandle(Point localPoint)
    {
        int hs = CardCanvasHelper.HandleSize;
        int edge = CardCanvasHelper.EdgeGripSize;
        int cornerHit = CardCanvasHelper.CornerHandleHitSize;

        var brRect = new Rectangle(Width - cornerHit, Height - cornerHit, cornerHit, cornerHit);
        if (brRect.Contains(localPoint)) return HandleKind.BottomRight;

        if (localPoint.Y >= Height - edge && localPoint.X >= edge && localPoint.X < Width - cornerHit)
            return HandleKind.Bottom;

        if (localPoint.X >= Width - edge && localPoint.Y >= edge && localPoint.Y < Height - cornerHit)
            return HandleKind.Right;

        if (_isSelected)
        {
            var rotateRect = new Rectangle(Width - hs * 3 - 6, 2, hs * 3 + 4, hs * 3 + 4);
            if (rotateRect.Contains(localPoint)) return HandleKind.Rotate;
        }

        return HandleKind.Move;
    }

    private void UpdateHoverHandle(HandleKind handle)
    {
        if (_hoverHandle == handle) return;
        _hoverHandle = handle;
        Cursor = handle switch
        {
            HandleKind.BottomRight => Cursors.SizeNWSE,
            HandleKind.Bottom => Cursors.SizeNS,
            HandleKind.Right => Cursors.SizeWE,
            HandleKind.Rotate => Cursors.Hand,
            _ => Cursors.Hand
        };
        Invalidate();
    }

    private void UpdateHoverFromMouse(Control? sender, MouseEventArgs e)
    {
        if (Capture || _mouseDownActive) return;

        var clientPt = sender is Control c && c != this
            ? PointToClient(c.PointToScreen(e.Location))
            : e.Location;

        UpdateHoverHandle(HitTestHandle(GetLocalPoint(clientPt)));
    }

    private void Card_MouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left) return;

        CardSelected?.Invoke(this, this);

        var clientPt = sender is Control c && c != this
            ? PointToClient(c.PointToScreen(e.Location))
            : e.Location;

        var local = GetLocalPoint(clientPt);
        _activeHandle = HitTestHandle(local);
        _dragStartScreen = Cursor.Position;
        _grabOffset = clientPt;
        _isCrossColumnDragging = false;
        _localCanvasMove = false;
        _canvasDragStartLocation = Location;
        _transformStartScreen = Cursor.Position;
        _transformStartSize = Size;
        _transformStartRotation = _card.Rotation;
        _transformStartAngle = Math.Atan2(local.Y - Height / 2.0, local.X - Width / 2.0);

        _mouseDownActive = true;

        if (_activeHandle is HandleKind.Rotate or HandleKind.BottomRight or HandleKind.Bottom or HandleKind.Right)
        {
            CardBeforeTransform?.Invoke(this, _card);
            Capture = true;
        }

        BringToFront();
    }

    private void ApplyVisualSize(int newW, int newH)
    {
        newW = Math.Max(CardSizeDefaults.MinWidth, newW);
        newH = Math.Max(CardSizeDefaults.MinHeight, newH);
        _card.SizePreset = CardSizePreset.Custom;
        _card.CustomWidth = newW;
        _card.CustomHeight = newH;
        Width = newW;
        Height = newH;

        int innerW = Math.Max(40, Width - 12);
        lblTitle.Width = innerW;
        lblTags.Width = innerW;
        LayoutForFixedHeight(newH);
        InvalidateRotatedCache();
        Invalidate();
    }

    private void MoveOnCanvas(Point canvasClient)
    {
        var canvas = Parent;
        if (canvas == null) return;

        var loc = new Point(canvasClient.X - _grabOffset.X, canvasClient.Y - _grabOffset.Y);
        canvas.SuspendLayout();
        Location = loc;
        canvas.ResumeLayout(false);
    }

    private void Card_MouseMove(object? sender, MouseEventArgs e)
    {
        if (e.Button == MouseButtons.None)
        {
            UpdateHoverFromMouse(sender as Control, e);
            return;
        }

        if (!_mouseDownActive && !Capture) return;
        if (e.Button != MouseButtons.Left) return;

        ProcessDragMove();
    }

    private bool IsPointOnSourceCanvas(Point screenPos)
    {
        if (Parent is not Panel canvas) return false;
        return canvas.RectangleToScreen(canvas.ClientRectangle).Contains(screenPos);
    }

    private void BeginCrossColumnDrag()
    {
        if (_isCrossColumnDragging) return;

        if (_localCanvasMove)
        {
            Location = _canvasDragStartLocation;
            _card.CanvasX = _canvasDragStartLocation.X;
            _card.CanvasY = _canvasDragStartLocation.Y;
            _localCanvasMove = false;
        }

        _isCrossColumnDragging = true;
        Capture = true;
        CardDragStarted?.Invoke(this, (_card, Cursor.Position));
    }

    private void ProcessDragMove()
    {

        if (_activeHandle == HandleKind.Rotate)
        {
            var local = GetLocalPoint(PointToClient(Cursor.Position));
            double angle = Math.Atan2(local.Y - Height / 2.0, local.X - Width / 2.0);
            float delta = (float)((angle - _transformStartAngle) * 180.0 / Math.PI);
            _card.Rotation = Math.Clamp(_transformStartRotation + delta,
                CardCanvasHelper.MinRotation, CardCanvasHelper.MaxRotation);
            InvalidateRotatedCache();
            Invalidate();
            return;
        }

        if (_activeHandle == HandleKind.BottomRight)
        {
            var pos = Cursor.Position;
            int dw = pos.X - _transformStartScreen.X;
            int dh = pos.Y - _transformStartScreen.Y;
            ApplyVisualSize(_transformStartSize.Width + dw, _transformStartSize.Height + dh);
            return;
        }

        if (_activeHandle == HandleKind.Bottom)
        {
            int dh = Cursor.Position.Y - _transformStartScreen.Y;
            ApplyVisualSize(_transformStartSize.Width, _transformStartSize.Height + dh);
            return;
        }

        if (_activeHandle == HandleKind.Right)
        {
            int dw = Cursor.Position.X - _transformStartScreen.X;
            ApplyVisualSize(_transformStartSize.Width + dw, _transformStartSize.Height);
            return;
        }

        var canvas = Parent;
        if (canvas == null) return;
        var canvasClient = canvas.PointToClient(Cursor.Position);
        var screenPos = Cursor.Position;

        if (_isCrossColumnDragging)
        {
            CardDragging?.Invoke(this, (_card, screenPos));
            return;
        }

        if (!_localCanvasMove)
        {
            if (Math.Abs(screenPos.X - _dragStartScreen.X) <= 6 &&
                Math.Abs(screenPos.Y - _dragStartScreen.Y) <= 6)
                return;

            if (IsPointOnSourceCanvas(screenPos))
            {
                _localCanvasMove = true;
                Capture = true;
                _canvasDragStartLocation = Location;
                CardBeforeTransform?.Invoke(this, _card);
                _grabOffset = new Point(canvasClient.X - Left, canvasClient.Y - Top);
                MoveOnCanvas(canvasClient);
            }
            else
            {
                BeginCrossColumnDrag();
                CardDragging?.Invoke(this, (_card, screenPos));
            }

            return;
        }

        if (!IsPointOnSourceCanvas(screenPos))
        {
            BeginCrossColumnDrag();
            CardDragging?.Invoke(this, (_card, screenPos));
            return;
        }

        MoveOnCanvas(canvasClient);
    }

    private void Card_MouseUp(object? sender, MouseEventArgs e)
    {
        if (!_mouseDownActive && !Capture && !_isCrossColumnDragging) return;

        Capture = false;
        _mouseDownActive = false;

        if (_activeHandle is HandleKind.Rotate or HandleKind.BottomRight or HandleKind.Bottom or HandleKind.Right)
        {
            _activeHandle = HandleKind.None;
            CardTransformChanged?.Invoke(this, _card);
            return;
        }

        if (_localCanvasMove)
        {
            _localCanvasMove = false;
            var canvas = Parent;
            canvas?.SuspendLayout();
            _card.CanvasX = Left;
            _card.CanvasY = Top;
            canvas?.ResumeLayout(false);
            _activeHandle = HandleKind.None;
            CardTransformChanged?.Invoke(this, _card);
            return;
        }

        if (_isCrossColumnDragging)
        {
            _isCrossColumnDragging = false;
            CardDragEnded?.Invoke(this, (_card, Cursor.Position));
        }

        _activeHandle = HandleKind.None;
    }

    private int GetColumnMaxWidth()
    {
        if (Parent is Panel canvas && canvas.Parent is KanbanColumnControl col)
            return Math.Max(CardSizeDefaults.MinWidth, canvas.ClientSize.Width - canvas.Padding.Horizontal);
        return Width;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        if (Math.Abs(_card.Rotation) > 0.5f)
        {
            panelCard.Visible = false;
            EnsureRotatedCache();
            if (_rotatedCache != null)
            {
                e.Graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                e.Graphics.TranslateTransform(Width / 2f, Height / 2f);
                e.Graphics.RotateTransform(_card.Rotation);
                e.Graphics.TranslateTransform(-Width / 2f, -Height / 2f);
                e.Graphics.DrawImage(_rotatedCache, 0, 0);
                e.Graphics.ResetTransform();
            }
        }
        else
        {
            panelCard.Visible = true;
            base.OnPaint(e);
        }

        if (_isSelected)
            DrawSelectionHandles(e.Graphics);
        else if (_isMouseOverCard || _activeHandle is HandleKind.BottomRight or HandleKind.Bottom or HandleKind.Right)
            DrawHoverResizeHandles(e.Graphics);
    }

    private Rectangle GetBottomRightHandleRect(bool emphasized = false)
    {
        int size = emphasized
            ? CardCanvasHelper.CornerHandleVisualSize + 2
            : CardCanvasHelper.CornerHandleVisualSize;
        const int inset = 2;
        return new Rectangle(Width - size - inset, Height - size - inset, size, size);
    }

    private Rectangle GetBottomEdgeHandleRect()
    {
        int thickness = CardCanvasHelper.EdgeHandleVisualThickness;
        int cornerReserve = CardCanvasHelper.CornerHandleHitSize / 2 + 2;
        int barW = Math.Max(36, Math.Min(Width - cornerReserve * 2, Width / 2));
        return new Rectangle(Width / 2 - barW / 2, Height - thickness - 2, barW, thickness);
    }

    private Rectangle GetRightEdgeHandleRect()
    {
        int thickness = CardCanvasHelper.EdgeHandleVisualThickness;
        int cornerReserve = CardCanvasHelper.CornerHandleHitSize / 2 + 2;
        int barH = Math.Max(36, Math.Min(Height - cornerReserve * 2, Height / 2));
        return new Rectangle(Width - thickness - 2, Height / 2 - barH / 2, thickness, barH);
    }

    private bool IsResizeHandleActive(HandleKind kind)
        => _hoverHandle == kind || _activeHandle == kind;

    private void DrawHoverResizeHandles(Graphics g)
    {
        DrawResizeEdgeZones(g, emphasized: true);

        using (var outline = new Pen(Color.FromArgb(140, 30, 100, 220), 1.5f))
            g.DrawRectangle(outline, 1, 1, Width - 3, Height - 3);

        DrawResizeHandleBox(g, GetBottomRightHandleRect(emphasized: true), HandleKind.BottomRight, showGrip: true);
        DrawResizeHandleBox(g, GetBottomEdgeHandleRect(), HandleKind.Bottom, showGrip: false);
        DrawResizeHandleBox(g, GetRightEdgeHandleRect(), HandleKind.Right, showGrip: false);
    }

    private void DrawResizeEdgeZones(Graphics g, bool emphasized)
    {
        int edge = CardCanvasHelper.EdgeHandleVisualThickness;
        int corner = CardCanvasHelper.CornerHandleHitSize / 2;
        int bottomAlpha = IsResizeHandleActive(HandleKind.Bottom) ? 100 : (emphasized ? 55 : 35);
        int rightAlpha = IsResizeHandleActive(HandleKind.Right) ? 100 : (emphasized ? 55 : 35);

        using var bottomBrush = new SolidBrush(Color.FromArgb(bottomAlpha, 30, 100, 220));
        using var rightBrush = new SolidBrush(Color.FromArgb(rightAlpha, 30, 100, 220));

        if (Width > corner * 2)
            g.FillRectangle(bottomBrush, corner, Height - edge, Width - corner * 2, edge);
        if (Height > corner * 2)
            g.FillRectangle(rightBrush, Width - edge, corner, edge, Height - corner * 2);
    }

    private void DrawResizeHandleBox(Graphics g, Rectangle rect, HandleKind kind, bool showGrip)
    {
        bool active = IsResizeHandleActive(kind);
        g.SmoothingMode = SmoothingMode.None;

        using var fill = new SolidBrush(active ? Color.White : Color.FromArgb(245, 255, 255, 255));
        using var border = new Pen(
            active ? Color.FromArgb(240, 20, 90, 210) : Color.FromArgb(200, 30, 100, 220),
            active ? 2f : 1.5f);
        g.FillRectangle(fill, rect);
        g.DrawRectangle(border, rect);

        if (!showGrip) return;

        using var grip = new Pen(Color.FromArgb(active ? 170 : 120, 60, 60, 60), 1f);
        int gx = rect.X + 3;
        int gy = rect.Bottom - 3;
        for (int i = 0; i < 3; i++)
            g.DrawLine(grip, gx + i * 3, gy, gx + i * 3, gy - (rect.Height - 5));
    }

    private void DrawSelectionHandles(Graphics g)
    {
        DrawResizeEdgeZones(g, emphasized: true);

        using var pen = new Pen(Color.FromArgb(220, 30, 100, 220), 2f);
        g.DrawRectangle(pen, 1, 1, Width - 3, Height - 3);

        DrawResizeHandleBox(g, GetBottomRightHandleRect(emphasized: true), HandleKind.BottomRight, showGrip: true);
        DrawResizeHandleBox(g, GetBottomEdgeHandleRect(), HandleKind.Bottom, showGrip: false);
        DrawResizeHandleBox(g, GetRightEdgeHandleRect(), HandleKind.Right, showGrip: false);

        int hs = CardCanvasHelper.HandleSize;
        using var brush = new SolidBrush(Color.White);
        using var border = new Pen(Color.FromArgb(220, 30, 100, 220), 1.5f);

        var rotate = new Rectangle(Width - hs * 3 - 4, 2, hs * 2 + 4, hs * 2 + 4);
        g.FillEllipse(brush, rotate);
        g.DrawEllipse(border, rotate);
        using var rotatePen = new Pen(Color.FromArgb(200, 30, 100, 220), 1.5f);
        g.DrawString("↻", new Font("Segoe UI", 8f, FontStyle.Bold), rotatePen.Brush, rotate.X + 3, rotate.Y + 2);
    }

    private void EnsureRotatedCache()
    {
        if (_rotatedCache != null &&
            _rotatedCache.Width == Width &&
            _rotatedCache.Height == Height)
            return;

        InvalidateRotatedCache();
        _rotatedCache = new Bitmap(Width, Height);
        panelCard.Visible = true;
        panelCard.DrawToBitmap(_rotatedCache, new Rectangle(0, 0, Width, Height));
    }

    private void InvalidateRotatedCache()
    {
        _rotatedCache?.Dispose();
        _rotatedCache = null;
        panelCard.Visible = true;
    }

    private void PanelCard_StickyEffect(object? sender, PaintEventArgs e)
    {
        if (Math.Abs(_card.Rotation) > 0.5f) return;

        const int fold = 12;
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        var r = panelCard.ClientRectangle;

        var base_ = panelCard.BackColor;
        var foldColor = Color.FromArgb(
            Math.Min(base_.R + 40, 255),
            Math.Min(base_.G + 40, 255),
            Math.Min(base_.B + 40, 255));
        using var foldBrush = new SolidBrush(foldColor);
        g.FillPolygon(foldBrush, new Point[]
        {
            new(r.Right - fold - 1, r.Top),
            new(r.Right - fold - 1, r.Top + fold),
            new(r.Right - 1,        r.Top + fold)
        });

        using var creasePen = new Pen(Color.FromArgb(50, 0, 0, 0), 1f);
        g.DrawLine(creasePen, r.Right - fold - 1, r.Top, r.Right - 1, r.Top + fold);
    }

    private void OnCardDoubleClick(object? sender, EventArgs e)
    {
        _mouseDownActive = false;
        Capture = false;
        _localCanvasMove = false;
        _isCrossColumnDragging = false;
        _activeHandle = HandleKind.None;
        CardDoubleClicked?.Invoke(this, _card);
    }

    private void menuEdit_Click(object sender, EventArgs e)
        => OnCardDoubleClick(sender, e);

    private void menuRotateLeft_Click(object sender, EventArgs e)
    {
        CardSelected?.Invoke(this, this);
        AdjustRotation(-CardCanvasHelper.RotationStep);
    }

    private void menuRotateRight_Click(object sender, EventArgs e)
    {
        CardSelected?.Invoke(this, this);
        AdjustRotation(CardCanvasHelper.RotationStep);
    }

    private void menuRotateReset_Click(object sender, EventArgs e)
    {
        CardSelected?.Invoke(this, this);
        ResetRotation();
    }

    private void ContextMenuCard_Opening(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        var col = GetOwnerColumn();
        if (col == null)
        {
            menuBringForward.Enabled = false;
            menuBringToFront.Enabled = false;
            menuSendBackward.Enabled = false;
            menuSendToBack.Enabled = false;
            return;
        }

        var caps = col.GetCardZOrderCapabilities(_card);
        menuBringForward.Enabled = caps.CanBringForward;
        menuBringToFront.Enabled = caps.CanBringToFront;
        menuSendBackward.Enabled = caps.CanSendBackward;
        menuSendToBack.Enabled = caps.CanSendToBack;
    }

    private KanbanColumnControl? GetOwnerColumn()
    {
        if (Parent is Panel canvas && canvas.Parent is KanbanColumnControl col)
            return col;
        return null;
    }

    private void RequestZOrderChange(CardZOrderAction action)
    {
        CardSelected?.Invoke(this, this);
        CardZOrderRequested?.Invoke(this, action);
    }

    private void menuBringForward_Click(object sender, EventArgs e)
        => RequestZOrderChange(CardZOrderAction.BringForward);

    private void menuBringToFront_Click(object sender, EventArgs e)
        => RequestZOrderChange(CardZOrderAction.BringToFront);

    private void menuSendBackward_Click(object sender, EventArgs e)
        => RequestZOrderChange(CardZOrderAction.SendBackward);

    private void menuSendToBack_Click(object sender, EventArgs e)
        => RequestZOrderChange(CardZOrderAction.SendToBack);

    private void menuDelete_Click(object sender, EventArgs e)
    {
        var result = MessageBox.Show(
            $"'{_card.Title}' 카드를 삭제하시겠습니까?",
            "삭제 확인",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Question);

        if (result == DialogResult.Yes)
            CardDeleted?.Invoke(this, _card);
    }
}
