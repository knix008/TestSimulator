using System.Drawing.Drawing2D;
using MyAgileBoardWinV10.Models;
using MyAgileBoardWinV10.Utils;

namespace MyAgileBoardWinV10.Controls;

public partial class KanbanCardControl : UserControl
{
    private enum HandleKind { None, Move, Resize, Rotate }

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
    private int _mouseOverCount;
    private Point _transformStartScreen;
    private Point _transformStartLocation;
    private Size _transformStartSize;
    private float _transformStartRotation;
    private double _transformStartAngle;
    private Bitmap? _rotatedCache;

    public KanbanCard Card => _card;
    public bool IsSelected => _isSelected;
    public bool IsInteracting => Capture || _localCanvasMove || _isCrossColumnDragging
        || _activeHandle is HandleKind.Rotate or HandleKind.Resize;

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
        panelResizeGrip.CardColor = cardColor;
        panelFoldCorner.CardColor = cardColor;
        panelFoldMask.BackColor = cardColor;

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
            // Collapse newlines → single space for single-line display; AutoEllipsis handles clipping
            var descFlat = string.Join(" ",
                descriptionText.Split(['\n', '\r'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
            lblDescription.Text = descFlat;
            lblDescription.Visible = true;
            toolTip.SetToolTip(this, descriptionText);
            toolTip.SetToolTip(panelCard, descriptionText);
            toolTip.SetToolTip(lblTitle, descriptionText);
            toolTip.SetToolTip(lblDescription, descriptionText);
        }
        else
        {
            lblDescription.Text = string.Empty;
            lblDescription.Visible = false;
            toolTip.SetToolTip(this, string.Empty);
            toolTip.SetToolTip(panelCard, string.Empty);
            toolTip.SetToolTip(lblTitle, string.Empty);
            toolTip.SetToolTip(lblDescription, string.Empty);
        }

        InvalidateRotatedCache();
        RefreshChrome();
    }

    /// <summary>접힘·그립·제목 영역을 동기화하고 다시 그립니다.</summary>
    public void RefreshChrome()
    {
        UpdateLabelMetrics();
        ApplyContentLayout();
        PositionChromeControls();
        panelFoldCorner?.Invalidate(true);
        panelResizeGrip?.Invalidate(true);
        Invalidate(true);
    }

    private void UpdateLabelMetrics()
    {
        int grip = CardCanvasHelper.ResizeGripVisualSize;
        bool showFold = _card.ShowTopRightFold && Math.Abs(_card.Rotation) < 0.5f;
        int fold = showFold ? CardFoldEffect.DefaultFoldSize : 0;
        int leftPad = 5;
        int contentW = panelCard.ClientSize.Width > 0 ? panelCard.ClientSize.Width : Width;
        int innerW = Math.Max(40, contentW - grip - leftPad - 3);
        int titleW = Math.Max(40, contentW - fold - leftPad);

        lblTitle.Width = titleW;
        lblTitle.Left = leftPad;
        lblDescription.Width = innerW;
        lblDescription.Left = leftPad;
        lblTags.Width = innerW;
        lblTags.Left = leftPad;
        lblTitle.AutoEllipsis = true;
        lblTitle.TextAlign = ContentAlignment.TopLeft;
    }

    public void ApplyLayout(int columnMaxWidth)
    {
        var (width, fixedHeight) = _card.ResolveDisplaySize(columnMaxWidth);
        Margin = Padding.Empty;
        Width = width;

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
        RefreshChrome();
    }

    private void LayoutForAutoHeight()
    {
        lblTitle.Height = Math.Min(36, Height - 20);
        lblTitle.Location = new Point(5, 4);

        int afterTitle = lblTitle.Bottom + 2;
        if (lblDescription.Visible)
        {
            lblDescription.Height = 14;
            lblDescription.Location = new Point(5, afterTitle);
            afterTitle = lblDescription.Bottom + 2;
        }

        lblPriority.Location = new Point(5, afterTitle);
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
            lblDescription.Visible = false;
        }
        else if (medium)
        {
            lblAssignee.Visible = !string.IsNullOrEmpty(_card.Assignee);
            lblDueDate.Visible = _card.DueDate.HasValue;
            lblTags.Visible = false;
        }

        int bottomReserve = lblPriority.Visible ? 18 : 16;
        int titleH = Math.Max(18, totalHeight - bottomReserve - 8);
        if (!compact && (lblAssignee.Visible || !string.IsNullOrEmpty(lblDescription.Text)))
            titleH = Math.Min(titleH, 36);
        lblTitle.Height = titleH;
        lblTitle.Location = new Point(5, 4);

        int metaY = totalHeight - CardCanvasHelper.ResizeGripVisualSize - 2;
        if (metaY < lblTitle.Bottom + 14)
            metaY = totalHeight - 16;

        // Show description in the gap between title and bottom meta row
        if (!compact && !string.IsNullOrEmpty(lblDescription.Text))
        {
            int descStart = lblTitle.Bottom + 3;
            int descAvailable = metaY - descStart - 3;
            if (descAvailable >= 14)
            {
                lblDescription.Height = 14;
                lblDescription.Location = new Point(5, descStart);
                lblDescription.Visible = true;
            }
            else
            {
                lblDescription.Visible = false;
            }
        }

        lblPriority.Location = new Point(5, metaY);
        int afterContent = (lblDescription.Visible ? lblDescription.Bottom : lblTitle.Bottom) + 2;
        lblAssignee.Location = new Point(5, Math.Min(metaY, afterContent));
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

        UpdateLabelMetrics();
    }

    private int GetTagsTop()
    {
        if (!lblTags.Visible) return lblTitle.Bottom;
        int y = (lblDescription.Visible ? lblDescription.Bottom : lblTitle.Bottom) + 2;
        if (lblAssignee.Visible) y = lblAssignee.Bottom + 1;
        else if (lblDueDate.Visible) y = lblDueDate.Bottom + 1;
        else if (lblPriority.Visible) y = lblPriority.Bottom + 1;
        return y;
    }

    private void AdjustHeight()
    {
        int h = lblTitle.Bottom + 4;
        if (lblDescription.Visible) h = Math.Max(h, lblDescription.Bottom + 4);
        if (lblPriority.Visible) h = Math.Max(h, lblPriority.Bottom + 4);
        if (lblAssignee.Visible) h = Math.Max(h, lblAssignee.Bottom + 4);
        if (lblDueDate.Visible) h = Math.Max(h, lblDueDate.Bottom + 4);
        if (lblTags.Visible) h = Math.Max(h, lblTags.Bottom + 4);
        Height = Math.Max(h, CardSizeDefaults.MinHeight);
    }

    private void ApplyCanvasLabelBackgrounds(Color cardColor)
    {
        lblTitle.BackColor = cardColor;
        lblDescription.BackColor = cardColor;
        lblPriority.BackColor = cardColor;
        lblAssignee.BackColor = cardColor;
        lblDueDate.BackColor = cardColor;
        lblTags.BackColor = cardColor;
        panelFoldMask.BackColor = cardColor;
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
        panelResizeGrip.MouseDown += ResizeGrip_MouseDown;
        panelResizeGrip.MouseMove += ResizeGrip_MouseMove;
        panelResizeGrip.MouseUp += ResizeGrip_MouseUp;
        panelResizeGrip.ContextMenuStrip = contextMenuCard;
        panelFoldCorner.ContextMenuStrip = contextMenuCard;
        toolTip.SetToolTip(panelResizeGrip, "드래그하여 크기 조절");

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

    private IEnumerable<Control> GetInteractiveControls()
    {
        yield return panelCard;
        yield return panelFoldCorner;
        yield return lblTitle;
        yield return lblDescription;
        yield return lblPriority;
        yield return lblAssignee;
        yield return lblDueDate;
        yield return lblTags;
    }

    private void ResizeGrip_MouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left) return;

        CardSelected?.Invoke(this, this);
        CardBeforeTransform?.Invoke(this, _card);

        _activeHandle = HandleKind.Resize;
        _mouseDownActive = true;
        _transformStartScreen = Cursor.Position;
        _transformStartSize = Size;
        _transformStartRotation = _card.Rotation;
        Capture = true;
        BringToFront();
    }

    private void ResizeGrip_MouseMove(object? sender, MouseEventArgs e)
    {
        if (_activeHandle != HandleKind.Resize) return;
        if (e.Button != MouseButtons.Left && !Capture) return;
        ApplyResizeFromGrip();
    }

    private void ResizeGrip_MouseUp(object? sender, MouseEventArgs e)
    {
        if (_activeHandle != HandleKind.Resize) return;

        Capture = false;
        _mouseDownActive = false;
        _activeHandle = HandleKind.None;
        CardTransformChanged?.Invoke(this, _card);
    }

    private void Card_MouseEnter(object? sender, EventArgs e)
    {
        _mouseOverCount++;
        Invalidate();
    }

    private void Card_MouseLeave(object? sender, EventArgs e)
    {
        _mouseOverCount = Math.Max(0, _mouseOverCount - 1);
        Invalidate();
    }

    private Point GetLocalPoint(Point clientPoint)
        => CardCanvasHelper.TransformPointToLocal(clientPoint, Width, Height, _card.Rotation);

    private void Card_MouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left) return;

        var clientPt = sender is Control c && c != this
            ? PointToClient(c.PointToScreen(e.Location))
            : e.Location;

        CardSelected?.Invoke(this, this);

        _activeHandle = HandleKind.Move;
        _dragStartScreen = Cursor.Position;
        _grabOffset = clientPt;
        _isCrossColumnDragging = false;
        _localCanvasMove = false;
        _canvasDragStartLocation = Location;
        _transformStartScreen = Cursor.Position;
        _transformStartLocation = Location;
        _transformStartSize = Size;
        _transformStartRotation = _card.Rotation;
        var local = GetLocalPoint(clientPt);
        _transformStartAngle = Math.Atan2(local.Y - Height / 2.0, local.X - Width / 2.0);
        _mouseDownActive = true;
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

        UpdateLabelMetrics();
        LayoutForFixedHeight(newH);
        PositionChromeControls();
        panelResizeGrip.BringToFront();
        InvalidateRotatedCache();
        Invalidate();
    }

    private void ApplyResizeFromGrip()
    {
        var pos = Cursor.Position;
        int dx = pos.X - _transformStartScreen.X;
        int dy = pos.Y - _transformStartScreen.Y;
        var localDelta = CardCanvasHelper.TransformDeltaToLocal(dx, dy, _transformStartRotation);

        int maxW = GetColumnMaxWidth();
        int newW = Math.Clamp(_transformStartSize.Width + localDelta.X, CardSizeDefaults.MinWidth, maxW);
        int newH = Math.Max(CardSizeDefaults.MinHeight, _transformStartSize.Height + localDelta.Y);
        ApplyVisualSize(newW, newH);
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
        if (_activeHandle == HandleKind.Resize) return;
        if (e.Button == MouseButtons.None) return;
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
        if (_activeHandle == HandleKind.Resize) return;
        if (!_mouseDownActive && !Capture && !_isCrossColumnDragging) return;

        Capture = false;
        _mouseDownActive = false;

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

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        if (_activeHandle == HandleKind.Resize && Capture)
            ApplyResizeFromGrip();
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        if (_activeHandle == HandleKind.Resize && e.Button == MouseButtons.Left)
        {
            ResizeGrip_MouseUp(panelResizeGrip, e);
            return;
        }

        base.OnMouseUp(e);
    }

    private int GetColumnMaxWidth()
    {
        if (Parent is Panel canvas && canvas.Parent is KanbanColumnControl col)
            return Math.Max(CardSizeDefaults.MinWidth, canvas.ClientSize.Width - canvas.Padding.Horizontal);
        return Width;
    }

    protected override void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        RefreshChrome();
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        if (IsHandleCreated)
            RefreshChrome();
    }

    private void PositionChromeControls()
    {
        if (panelResizeGrip == null || panelFoldCorner == null) return;

        int grip = CardCanvasHelper.ResizeGripVisualSize;
        int fold = CardFoldEffect.DefaultFoldSize;

        panelResizeGrip.Size = new Size(grip, grip);
        panelResizeGrip.Location = new Point(
            Math.Max(0, ClientSize.Width - grip),
            Math.Max(0, ClientSize.Height - grip));

        panelFoldCorner.Size = new Size(fold, fold);
        panelFoldCorner.Location = new Point(
            Math.Max(0, ClientSize.Width - fold),
            0);

        bool showChrome = Math.Abs(_card.Rotation) < 0.5f;
        bool showFold = showChrome && _card.ShowTopRightFold;

        panelResizeGrip.Visible = showChrome;
        panelFoldCorner.Visible = showFold;

        panelFoldMask.Visible = showFold;
        if (showFold)
        {
            panelFoldMask.Size = new Size(fold, fold);
            panelFoldMask.Location = new Point(
                Math.Max(0, panelCard.ClientSize.Width - fold),
                0);
            panelFoldMask.BringToFront();
        }

        panelFoldCorner.BringToFront();
        panelResizeGrip.BringToFront();
    }

    protected override void OnVisibleChanged(EventArgs e)
    {
        base.OnVisibleChanged(e);
        if (Visible && IsHandleCreated)
            RefreshChrome();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        if (Math.Abs(_card.Rotation) > 0.5f)
        {
            panelCard.Visible = false;
            panelResizeGrip.Visible = false;
            panelFoldCorner.Visible = false;
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
        {
            using var pen = new Pen(Color.FromArgb(200, 30, 100, 220), 2f) { DashStyle = DashStyle.Dash };
            e.Graphics.DrawRectangle(pen, 1, 1, Width - 3, Height - 3);
        }
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
        panelResizeGrip.Visible = false;
        panelFoldCorner.Visible = false;
        panelCard.DrawToBitmap(_rotatedCache, new Rectangle(0, 0, Width, Height));
        using (var g = Graphics.FromImage(_rotatedCache))
        {
            if (_card.ShowTopRightFold)
                CardFoldEffect.DrawTopRightFold(g, new Rectangle(0, 0, Width, Height), panelCard.BackColor);

            CardResizeGripPainter.Paint(g,
                new Rectangle(Width - CardCanvasHelper.ResizeGripVisualSize,
                    Height - CardCanvasHelper.ResizeGripVisualSize,
                    CardCanvasHelper.ResizeGripVisualSize,
                    CardCanvasHelper.ResizeGripVisualSize),
                panelCard.BackColor);
        }
    }

    private void InvalidateRotatedCache()
    {
        _rotatedCache?.Dispose();
        _rotatedCache = null;
        panelCard.Visible = true;
        panelResizeGrip.Visible = Math.Abs(_card.Rotation) < 0.5f;
        panelFoldCorner.Visible = Math.Abs(_card.Rotation) < 0.5f && _card.ShowTopRightFold;
        PositionChromeControls();
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
