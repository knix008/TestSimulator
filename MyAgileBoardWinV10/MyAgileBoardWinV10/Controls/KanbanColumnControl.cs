using MyAgileBoardWinV10.Models;
using MyAgileBoardWinV10.Utils;

namespace MyAgileBoardWinV10.Controls;

public partial class KanbanColumnControl : UserControl
{
    private KanbanColumn _column;
    private bool _isHeaderDragging = false;
    private bool _isWidthResizing = false;
    private bool _showGrid = true;
    private bool _layoutFinalized = false;
    private Point _dragStartLocal;
    private int _widthDragStartScreenX;
    private int _widthDragStartValue;
    private Font? _appliedTitleFont;
    private KanbanCardControl? _selectedCard;

    public KanbanColumn Column => _column;

    public event EventHandler<KanbanColumn>? AddCardRequested;
    public event EventHandler<KanbanColumn>? ColumnSettingsRequested;
    public event EventHandler<KanbanColumn>? DeleteColumnRequested;
    public event EventHandler? ProjectChanged;
    public event EventHandler? BeforeProjectChange;
    public event EventHandler<(KanbanCard Card, string ColumnName)>? CardArchivedRequested;

    public event EventHandler<Point>? ColumnHeaderDragStarted;
    public event EventHandler<Point>? ColumnHeaderDragging;
    public event EventHandler<Point>? ColumnHeaderDragEnded;

    public event EventHandler<(KanbanCard Card, Point ScreenPos)>? CardDragStarted;
    public event EventHandler<(KanbanCard Card, Point ScreenPos)>? CardDragging;
    public event EventHandler<(KanbanCard Card, Point ScreenPos)>? CardDragEnded;
    public event EventHandler<KanbanCard>? CardTransformChanged;
    public event EventHandler? ColumnWidthChanged;
    public event EventHandler? ColumnWidthLiveChanged;

    public bool IsResizingWidth => _isWidthResizing;

    public void SetGridVisible(bool show)
    {
        if (_showGrid == show) return;
        _showGrid = show;
        panelCanvas.Invalidate();
    }

    public KanbanColumnControl(KanbanColumn column)
    {
        _column = column;
        InitializeComponent();
        SetupIcons();
        SetupResizeGrip();
        if (column.ColumnWidth <= 0)
            column.ColumnWidth = ColumnWidthDefaults.Default;
        SetupCanvas();
        UpdateHeader();
        LoadCards();
    }

    private void SetupResizeGrip()
    {
        panelResizeGrip.MouseDown += PanelResizeGrip_MouseDown;
        panelResizeGrip.MouseMove += PanelResizeGrip_MouseMove;
        panelResizeGrip.MouseUp += PanelResizeGrip_MouseUp;
    }

    public void SetColumnWidthWeight(int weight)
    {
        _column.ColumnWidth = Math.Max(1, weight);
    }

    public void SetVisualWidth(int pixelWidth)
    {
        pixelWidth = Math.Max(ColumnWidthDefaults.Min, pixelWidth);
        if (Width == pixelWidth) return;
        Width = pixelWidth;
        ApplyCardLayouts();
    }

    // Called from RebuildBoard() after proportional widths are set.
    // Until this runs, ClampCardControl/PositionCardControl don't write back to the model.
    public void FinalizeLayout()
    {
        _layoutFinalized = true;
        ApplyCardLayouts();
    }

    public void SetLastColumn(bool isLast)
        => panelResizeGrip.Visible = !isLast;

    private void SetColumnWidthLive(int width)
    {
        SetVisualWidth(width);
        ColumnWidthLiveChanged?.Invoke(this, EventArgs.Empty);
    }

    private void PanelResizeGrip_MouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left) return;
        _isWidthResizing = true;
        _widthDragStartScreenX = Cursor.Position.X;
        _widthDragStartValue = Width;
        BeforeProjectChange?.Invoke(this, EventArgs.Empty);
        panelResizeGrip.Capture = true;
    }

    private void PanelResizeGrip_MouseMove(object? sender, MouseEventArgs e)
    {
        if (!_isWidthResizing || e.Button != MouseButtons.Left) return;
        int delta = Cursor.Position.X - _widthDragStartScreenX;
        SetColumnWidthLive(_widthDragStartValue + delta);
    }

    private void PanelResizeGrip_MouseUp(object? sender, MouseEventArgs e)
    {
        if (!_isWidthResizing) return;
        _isWidthResizing = false;
        panelResizeGrip.Capture = false;

        if (_widthDragStartValue > 0)
        {
            double ratio = Width / (double)_widthDragStartValue;
            _column.ColumnWidth = Math.Max(1, (int)Math.Round(_column.ColumnWidth * ratio));
        }

        ColumnWidthChanged?.Invoke(this, EventArgs.Empty);
        ProjectChanged?.Invoke(this, EventArgs.Empty);
    }


    private void SetupCanvas()
    {
        panelCanvas.Resize += (_, _) =>
        {
            if (HasInteractingCard()) return;
            ApplyCardSizesOnly();
        };
        panelCanvas.MouseDown += (_, e) =>
        {
            if (e.Button == MouseButtons.Left)
                DeselectAllCards();
        };
    }

    private bool HasInteractingCard()
        => panelCanvas.Controls.OfType<KanbanCardControl>().Any(c => c.IsInteracting);

    public void ApplyCardSizesOnly()
    {
        int maxW = GetCanvasInnerWidth();
        if (maxW < CardSizeDefaults.MinWidth) return;

        panelCanvas.SuspendLayout();
        foreach (KanbanCardControl ctrl in panelCanvas.Controls.OfType<KanbanCardControl>())
        {
            ctrl.ApplyLayout(maxW);
            ClampCardControl(ctrl);
        }
        panelCanvas.ResumeLayout(false);
    }

    public void ApplyCardLayouts()
    {
        int maxW = GetCanvasInnerWidth();
        if (maxW < CardSizeDefaults.MinWidth) return;

        EnsureAllCanvasPositions(maxW);

        panelCanvas.SuspendLayout();
        foreach (KanbanCardControl ctrl in panelCanvas.Controls.OfType<KanbanCardControl>())
        {
            ctrl.ApplyLayout(maxW);
            PositionCardControl(ctrl);
        }
        panelCanvas.ResumeLayout(false);

        SortCardsByZIndex();
    }

    protected override void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        ApplyCardLayouts();
    }

    private void SetupIcons()
    {
        menuAddCardFromMenu.Image = IconFactory.Get("add");
        menuColumnSettings.Image = IconFactory.Get("settings");
        menuCompletionToggle.Image = IconFactory.Get("check");
        menuDeleteColumn.Image = IconFactory.Get("delete");
    }

    public int GetCanvasInnerWidth()
    {
        return Math.Max(CardSizeDefaults.MinWidth,
            panelCanvas.ClientSize.Width - panelCanvas.Padding.Horizontal);
    }

    private void EnsureAllCanvasPositions(int maxW)
    {
        int nextY = CardCanvasHelper.CanvasPadding;
        for (int i = 0; i < _column.Cards.Count; i++)
        {
            var card = _column.Cards[i];
            if (card.HasCanvasPosition())
            {
                nextY = Math.Max(nextY, card.CanvasY + card.ResolveDisplaySize(maxW).Height + 12);
                continue;
            }

            var (_, h) = card.ResolveDisplaySize(maxW);
            card.CanvasX = CardCanvasHelper.CanvasPadding + (i % 4) * 14 + card.OffsetX;
            card.CanvasY = nextY;
            card.OffsetX = 0;
            if (card.ZIndex == 0)
                card.ZIndex = i + 1;
            nextY += h + 12;
        }
    }

    private void ClampCardControl(KanbanCardControl ctrl)
    {
        if (!_layoutFinalized)
        {
            // Before final proportional widths are established, just keep the
            // control visually in sync with the model — don't corrupt the model.
            ctrl.Location = new Point(ctrl.Card.CanvasX, ctrl.Card.CanvasY);
            return;
        }

        var canvasSize = panelCanvas.ClientSize;
        if (canvasSize.Width <= 0 || canvasSize.Height <= 0) return;

        var card = ctrl.Card;
        var bounds = CardCanvasHelper.GetRotatedBounds(ctrl.Width, ctrl.Height, card.Rotation);
        var loc = CardCanvasHelper.ClampToCanvas(new Point(card.CanvasX, card.CanvasY), bounds, canvasSize);
        card.CanvasX = loc.X;
        card.CanvasY = loc.Y;
        ctrl.Location = loc;
    }

    private void PositionCardControl(KanbanCardControl ctrl)
    {
        var card = ctrl.Card;
        var loc = new Point(card.CanvasX, card.CanvasY);
        // Only clamp and write back to the model once the column has its final
        // proportional width (FinalizeLayout sets _layoutFinalized = true).
        // Before that, column may have the designer default width (244 px) which
        // would clamp saved positions to wrong values.
        if (_layoutFinalized)
        {
            var canvasSize = panelCanvas.ClientSize;
            if (canvasSize.Width > 0 && canvasSize.Height > 0)
            {
                var bounds = CardCanvasHelper.GetRotatedBounds(ctrl.Width, ctrl.Height, card.Rotation);
                loc = CardCanvasHelper.ClampToCanvas(loc, bounds, canvasSize);
                card.CanvasX = loc.X;
                card.CanvasY = loc.Y;
            }
        }
        ctrl.Location = loc;
    }

    private void SortCardsByZIndex()
    {
        // In WinForms, Controls[0] is drawn on top. Higher ZIndex = more in front → index 0.
        var controls = panelCanvas.Controls.OfType<KanbanCardControl>()
            .OrderByDescending(c => c.Card.ZIndex)
            .ToList();
        for (int i = 0; i < controls.Count; i++)
            panelCanvas.Controls.SetChildIndex(controls[i], i);
    }

    public KanbanCardControl? SelectedCardControl => _selectedCard;

    public void DeselectAllCards()
    {
        foreach (var ctrl in panelCanvas.Controls.OfType<KanbanCardControl>())
            ctrl.SetSelected(false);
        _selectedCard = null;
    }

    public bool RotateSelectedCard(float delta)
    {
        if (_selectedCard == null) return false;
        _selectedCard.AdjustRotation(delta);
        return true;
    }

    public bool ResetSelectedCardRotation()
    {
        if (_selectedCard == null) return false;
        _selectedCard.ResetRotation();
        return true;
    }

    public (bool CanBringForward, bool CanBringToFront, bool CanSendBackward, bool CanSendToBack)
        GetCardZOrderCapabilities(KanbanCard card)
    {
        var sorted = GetCardsSortedByZIndex();
        if (sorted.Count <= 1)
            return (false, false, false, false);

        int idx = sorted.FindIndex(c => c.Id == card.Id);
        if (idx < 0)
            return (false, false, false, false);

        bool canRaise = idx < sorted.Count - 1;
        bool canLower = idx > 0;
        return (canRaise, canRaise, canLower, canLower);
    }

    public bool ChangeCardZOrder(KanbanCard card, CardZOrderAction action)
    {
        var sorted = GetCardsSortedByZIndex();
        int idx = sorted.FindIndex(c => c.Id == card.Id);
        if (idx < 0) return false;

        int targetIdx = action switch
        {
            CardZOrderAction.BringForward => idx + 1,
            CardZOrderAction.BringToFront => sorted.Count - 1,
            CardZOrderAction.SendBackward => idx - 1,
            CardZOrderAction.SendToBack => 0,
            _ => idx
        };

        targetIdx = Math.Clamp(targetIdx, 0, sorted.Count - 1);
        if (targetIdx == idx) return false;

        BeforeProjectChange?.Invoke(this, EventArgs.Empty);

        var moving = sorted[idx];
        sorted.RemoveAt(idx);
        sorted.Insert(targetIdx, moving);
        for (int i = 0; i < sorted.Count; i++)
            sorted[i].ZIndex = i + 1;

        SortCardsByZIndex();

        var ctrl = FindCardControl(card);
        if (ctrl != null)
        {
            DeselectAllCards();
            _selectedCard = ctrl;
            ctrl.SetSelected(true);
        }

        ProjectChanged?.Invoke(this, EventArgs.Empty);
        return true;
    }

    private List<KanbanCard> GetCardsSortedByZIndex()
        => _column.Cards.OrderBy(c => c.ZIndex).ThenBy(c => c.Id).ToList();

    private int NextZIndexFor(KanbanCard card)
    {
        int maxZ = _column.Cards
            .Select(c => c.ZIndex)
            .DefaultIfEmpty(0)
            .Max();
        return maxZ + 1;
    }

    private void SelectCard(KanbanCardControl ctrl)
    {
        if (!_column.Cards.Any(c => c.Id == ctrl.Card.Id))
            return;

        DeselectAllCards();
        _selectedCard = ctrl;
        ctrl.SetSelected(true);
        ctrl.Card.ZIndex = NextZIndexFor(ctrl.Card);
        ctrl.BringToFront();
        SortCardsByZIndex();
    }

    public bool ContainsScreenPoint(Point screenPos)
        => RectangleToScreen(ClientRectangle).Contains(screenPos);

    public bool ContainsCanvasPoint(Point screenPos)
        => panelCanvas.RectangleToScreen(panelCanvas.ClientRectangle).Contains(screenPos);

    public Point GetCanvasDropLocation(Point screenPos, Size cardSize)
    {
        var local = panelCanvas.PointToClient(screenPos);
        var loc = new Point(local.X - cardSize.Width / 2, local.Y - cardSize.Height / 2);
        return CardCanvasHelper.ClampToCanvas(loc, cardSize, panelCanvas.ClientSize);
    }

    public void UpdateHeader()
    {
        var bgColor = ColorTranslator.FromHtml(_column.HeaderColorHex);
        panelHeader.BackColor = bgColor;

        ApplyTitleFont();
        var textColor = _column.ResolveTitleColor(bgColor);
        lblColumnName.ForeColor = textColor;
        btnColumnMenu.ForeColor = textColor;

        lblColumnName.Text = $"{_column.Name}  ({_column.Cards.Count})";

        menuCompletionToggle.Text = _column.IsCompletionColumn
            ? "완료 컬럼 해제"
            : "완료 컬럼으로 설정";
    }

    private void ApplyTitleFont()
    {
        var font = _column.CreateTitleFont();
        if (_appliedTitleFont != null && _appliedTitleFont.Equals(font))
        {
            font.Dispose();
            return;
        }

        _appliedTitleFont?.Dispose();
        _appliedTitleFont = font;
        lblColumnName.Font = font;
    }

    public void LoadCards()
    {
        var existing = panelCanvas.Controls.OfType<KanbanCardControl>().ToArray();
        panelCanvas.Controls.Clear();
        foreach (var c in existing) c.Dispose();

        foreach (var card in _column.Cards)
            CreateCardControl(card);

        ApplyCardLayouts();
    }

    private KanbanCardControl CreateCardControl(KanbanCard card)
    {
        var ctrl = new KanbanCardControl(card);
        WireCardControlEvents(ctrl);
        panelCanvas.Controls.Add(ctrl);
        return ctrl;
    }

    private void UnwireCardControlEvents(KanbanCardControl ctrl)
    {
        ctrl.CardDoubleClicked -= OnCardDoubleClicked;
        ctrl.CardDeleted -= OnCardDeleted;
        ctrl.CardSelected -= OnCardSelected;
        ctrl.CardBeforeTransform -= OnCardBeforeTransform;
        ctrl.CardTransformChanged -= OnCardTransformChanged;
        ctrl.CardDragStarted -= OnCardDragStartedRelay;
        ctrl.CardDragging -= OnCardDraggingRelay;
        ctrl.CardDragEnded -= OnCardDragEndedRelay;
        ctrl.CardZOrderRequested -= OnCardZOrderRequested;
    }

    private void WireCardControlEvents(KanbanCardControl ctrl)
    {
        UnwireCardControlEvents(ctrl);

        ctrl.CardDoubleClicked += OnCardDoubleClicked;
        ctrl.CardDeleted += OnCardDeleted;
        ctrl.CardSelected += OnCardSelected;
        ctrl.CardBeforeTransform += OnCardBeforeTransform;
        ctrl.CardTransformChanged += OnCardTransformChanged;
        ctrl.CardDragStarted += OnCardDragStartedRelay;
        ctrl.CardDragging += OnCardDraggingRelay;
        ctrl.CardDragEnded += OnCardDragEndedRelay;
        ctrl.CardZOrderRequested += OnCardZOrderRequested;
    }

    private void OnCardZOrderRequested(object? sender, CardZOrderAction action)
    {
        if (sender is KanbanCardControl ctrl)
            ChangeCardZOrder(ctrl.Card, action);
    }

    private void OnCardBeforeTransform(object? sender, KanbanCard card)
        => BeforeProjectChange?.Invoke(this, EventArgs.Empty);

    private void OnCardDragStartedRelay(object? sender, (KanbanCard Card, Point ScreenPos) e)
        => CardDragStarted?.Invoke(sender, e);

    private void OnCardDraggingRelay(object? sender, (KanbanCard Card, Point ScreenPos) e)
        => CardDragging?.Invoke(sender, e);

    private void OnCardDragEndedRelay(object? sender, (KanbanCard Card, Point ScreenPos) e)
        => CardDragEnded?.Invoke(sender, e);

    public void AddCard(KanbanCard card)
    {
        _column.Cards.Add(card);
        if (card.ZIndex == 0)
            card.ZIndex = NextZIndexFor(card);

        int maxW = GetCanvasInnerWidth();
        if (!card.HasCanvasPosition())
        {
            var (_, h) = card.ResolveDisplaySize(maxW);
            int maxBottom = _column.Cards
                .Where(c => c.Id != card.Id && c.HasCanvasPosition())
                .Select(c => c.CanvasY + c.ResolveDisplaySize(maxW).Height)
                .DefaultIfEmpty(CardCanvasHelper.CanvasPadding)
                .Max();
            card.CanvasX = CardCanvasHelper.CanvasPadding + (_column.Cards.Count % 4) * 16;
            card.CanvasY = maxBottom + 12;
        }

        CreateCardControl(card);
        ApplyCardLayouts();
        UpdateHeader();
    }

    public void RemoveCard(KanbanCard card)
    {
        _column.Cards.Remove(card);
        var toRemove = panelCanvas.Controls
            .OfType<KanbanCardControl>()
            .FirstOrDefault(c => c.Card.Id == card.Id);
        if (toRemove != null)
        {
            if (_selectedCard == toRemove) _selectedCard = null;
            panelCanvas.Controls.Remove(toRemove);
            toRemove.Dispose();
        }
        UpdateHeader();
    }

    public KanbanCardControl? DetachCardControl(KanbanCard card, KanbanCardControl? fallbackCtrl = null)
    {
        var ctrl = FindCardControl(card) ?? fallbackCtrl;
        if (ctrl == null) return null;

        UnwireCardControlEvents(ctrl);
        if (_selectedCard == ctrl) _selectedCard = null;

        if (ctrl.Parent is Control parent)
            parent.Controls.Remove(ctrl);

        return ctrl;
    }

    public void AttachCardControl(KanbanCardControl ctrl, Point location)
    {
        if (ctrl.Parent is Control existingParent && existingParent != panelCanvas)
            existingParent.Controls.Remove(ctrl);

        WireCardControlEvents(ctrl);
        ctrl.Visible = true;

        if (ctrl.Parent != panelCanvas)
            panelCanvas.Controls.Add(ctrl);

        ctrl.ApplyLayout(GetCanvasInnerWidth());
        ctrl.BringToFront();
        SetCardCanvasPosition(ctrl.Card, location);
        SortCardsByZIndex();
    }

    public KanbanCardControl? FindCardControl(KanbanCard card)
        => panelCanvas.Controls.OfType<KanbanCardControl>().FirstOrDefault(c => c.Card.Id == card.Id);

    public void SetCardCanvasPosition(KanbanCard card, Point location, bool clamp = true)
    {
        var ctrl = FindCardControl(card);
        if (ctrl == null) return;

        var bounds = CardCanvasHelper.GetRotatedBounds(ctrl.Width, ctrl.Height, card.Rotation);
        if (clamp)
            location = CardCanvasHelper.ClampToCanvas(location, bounds, panelCanvas.ClientSize);

        card.CanvasX = location.X;
        card.CanvasY = location.Y;
        ctrl.Location = location;
    }

    private void OnCardSelected(object? sender, KanbanCardControl ctrl)
        => SelectCard(ctrl);

    private void OnCardTransformChanged(object? sender, KanbanCard card)
    {
        var ctrl = FindCardControl(card);
        if (ctrl != null)
        {
            ClampCardControl(ctrl);
            ctrl.BringToFront();
            SortCardsByZIndex();
        }
        CardTransformChanged?.Invoke(this, card);
        ProjectChanged?.Invoke(this, EventArgs.Empty);
    }

    private void OnCardDoubleClicked(object? sender, KanbanCard card)
    {
        BeforeProjectChange?.Invoke(this, EventArgs.Empty);
        using var form = new Forms.CardEditForm(card);
        if (form.ShowDialog() == DialogResult.OK)
        {
            FindCardControl(card)?.UpdateDisplay();
            ApplyCardLayouts();
            UpdateHeader();
            ProjectChanged?.Invoke(this, EventArgs.Empty);
        }
    }

    private void OnCardDeleted(object? sender, KanbanCard card)
    {
        var result = MessageBox.Show(
            $"'{card.Title}' 카드를 삭제하시겠습니까?",
            "삭제 확인", MessageBoxButtons.YesNo, MessageBoxIcon.Question);

        if (result != DialogResult.Yes) return;

        BeforeProjectChange?.Invoke(this, EventArgs.Empty);
        RemoveCard(card);

        if (_column.IsCompletionColumn)
            CardArchivedRequested?.Invoke(this, (card, _column.Name));

        ProjectChanged?.Invoke(this, EventArgs.Empty);
    }

    private void panelCanvas_Paint(object? sender, PaintEventArgs e)
    {
        if (!_showGrid) return;
        using var pen = new Pen(Color.FromArgb(28, 0, 0, 0), 1f);
        int step = 24;
        var clip = e.ClipRectangle;
        for (int x = clip.Left - clip.Left % step; x < clip.Right; x += step)
            e.Graphics.DrawLine(pen, x, clip.Top, x, clip.Bottom);
        for (int y = clip.Top - clip.Top % step; y < clip.Bottom; y += step)
            e.Graphics.DrawLine(pen, clip.Left, y, clip.Right, y);
    }

    internal void panelHeader_MouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button == MouseButtons.Left)
        {
            _dragStartLocal = e.Location;
            _isHeaderDragging = false;
            panelHeader.Capture = true;
        }
    }

    internal void panelHeader_MouseMove(object? sender, MouseEventArgs e)
    {
        if (!panelHeader.Capture || e.Button != MouseButtons.Left) return;

        if (!_isHeaderDragging)
        {
            if (Math.Abs(e.X - _dragStartLocal.X) > 8 || Math.Abs(e.Y - _dragStartLocal.Y) > 8)
            {
                _isHeaderDragging = true;
                ColumnHeaderDragStarted?.Invoke(this, panelHeader.PointToScreen(e.Location));
            }
        }

        if (_isHeaderDragging)
            ColumnHeaderDragging?.Invoke(this, panelHeader.PointToScreen(e.Location));
    }

    internal void panelHeader_MouseUp(object? sender, MouseEventArgs e)
    {
        panelHeader.Capture = false;
        if (_isHeaderDragging)
        {
            _isHeaderDragging = false;
            ColumnHeaderDragEnded?.Invoke(this, panelHeader.PointToScreen(e.Location));
        }
    }

    private void btnAddCard_Click(object sender, EventArgs e)
        => AddCardRequested?.Invoke(this, _column);

    private void menuAddCardFromMenu_Click(object sender, EventArgs e)
        => AddCardRequested?.Invoke(this, _column);

    private void btnColumnMenu_Click(object sender, EventArgs e)
        => contextMenuColumn.Show(btnColumnMenu, new Point(0, btnColumnMenu.Height));

    private void menuColumnSettings_Click(object sender, EventArgs e)
        => ColumnSettingsRequested?.Invoke(this, _column);

    private void menuDeleteColumn_Click(object sender, EventArgs e)
    {
        if (_column.Cards.Count > 0)
        {
            var result = MessageBox.Show(
                $"'{_column.Name}' 컬럼에 카드가 {_column.Cards.Count}개 있습니다. 삭제하시겠습니까?",
                "컬럼 삭제", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
            if (result != DialogResult.Yes) return;
        }
        DeleteColumnRequested?.Invoke(this, _column);
    }

    private void menuCompletionToggle_Click(object sender, EventArgs e)
    {
        BeforeProjectChange?.Invoke(this, EventArgs.Empty);
        _column.IsCompletionColumn = !_column.IsCompletionColumn;
        UpdateHeader();
        ProjectChanged?.Invoke(this, EventArgs.Empty);
    }
}
