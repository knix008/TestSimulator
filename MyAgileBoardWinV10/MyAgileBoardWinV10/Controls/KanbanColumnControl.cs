using MyAgileBoardWinV10.Models;
using MyAgileBoardWinV10.Utils;

namespace MyAgileBoardWinV10.Controls;

public partial class KanbanColumnControl : UserControl
{
    private KanbanColumn _column;
    private bool _isHeaderDragging = false;
    private Point _dragStartLocal;
    private Panel? _cardPlaceholder;
    private int _lastCardDropInsertIdx = -1;

    public KanbanColumn Column => _column;

    // ── Column-level events ────────────────────────────────────────
    public event EventHandler<KanbanColumn>? AddCardRequested;
    public event EventHandler<KanbanColumn>? ColumnSettingsRequested;
    public event EventHandler<KanbanColumn>? DeleteColumnRequested;
    public event EventHandler? ProjectChanged;
    // Fires before any model change so the parent can save an undo snapshot
    public event EventHandler? BeforeProjectChange;
    // Fires when a card from a completion column is being archived (instead of deleted)
    public event EventHandler<(KanbanCard Card, string ColumnName)>? CardArchivedRequested;

    // Column header drag events (screen coords)
    public event EventHandler<Point>? ColumnHeaderDragStarted;
    public event EventHandler<Point>? ColumnHeaderDragging;
    public event EventHandler<Point>? ColumnHeaderDragEnded;

    // Card drag relay events (screen coords, sender = KanbanCardControl)
    public event EventHandler<(KanbanCard Card, Point ScreenPos)>? CardDragStarted;
    public event EventHandler<(KanbanCard Card, Point ScreenPos)>? CardDragging;
    public event EventHandler<(KanbanCard Card, Point ScreenPos)>? CardDragEnded;

    public KanbanColumnControl(KanbanColumn column)
    {
        _column = column;
        InitializeComponent();
        SetupIcons();
        UpdateHeader();

        flowCards.SizeChanged += (_, _) => UpdateCardWidths();

        LoadCards();
    }

    protected override void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        UpdateCardWidths();
    }

    private void SetupIcons()
    {
        menuAddCardFromMenu.Image = IconFactory.Get("add");
        menuColumnSettings.Image = IconFactory.Get("settings");
        menuCompletionToggle.Image = IconFactory.Get("check");
        menuDeleteColumn.Image = IconFactory.Get("delete");
    }

    // ── Card width management ──────────────────────────────────────

    private void UpdateCardWidths()
    {
        // Each card has Margin = (3,3,3,2); left visible gap = Padding.Left + Margin.Left = 4+3 = 7
        // For equal right gap, card.Width = ClientWidth - Padding.Left - Padding.Right - Margin.Left - Margin.Right
        int w = flowCards.ClientSize.Width
                - flowCards.Padding.Left - flowCards.Padding.Right
                - 6; // card Margin.Left(3) + Margin.Right(3)
        if (w < 60) return;
        foreach (KanbanCardControl ctrl in flowCards.Controls.OfType<KanbanCardControl>())
            ctrl.Width = w;
    }

    // ── Card drop placeholder (push effect) ───────────────────────

    public void ShowCardDropIndicator(int insertIdx, int placeholderHeight = 56)
    {
        var cards = flowCards.Controls.OfType<KanbanCardControl>().Where(c => c.Visible).ToList();
        insertIdx = Math.Clamp(insertIdx, 0, cards.Count);

        if (_cardPlaceholder != null
            && flowCards.Controls.Contains(_cardPlaceholder)
            && insertIdx == _lastCardDropInsertIdx
            && _cardPlaceholder.Height == placeholderHeight)
            return;

        _lastCardDropInsertIdx = insertIdx;

        if (_cardPlaceholder == null)
        {
            _cardPlaceholder = new Panel
            {
                BackColor = Color.FromArgb(100, 30, 144, 255),
                BorderStyle = BorderStyle.FixedSingle,
                Margin = new Padding(3, 3, 3, 2)
            };
        }

        _cardPlaceholder.Height = placeholderHeight;
        int w = flowCards.ClientSize.Width - flowCards.Padding.Horizontal - 6;
        _cardPlaceholder.Width = Math.Max(w, 60);

        flowCards.SuspendLayout();

        bool hadPlaceholder = flowCards.Controls.Contains(_cardPlaceholder);
        if (hadPlaceholder)
            flowCards.Controls.Remove(_cardPlaceholder);

        int targetIdx = cards.Count == 0
            ? 0
            : insertIdx < cards.Count
                ? flowCards.Controls.IndexOf(cards[insertIdx])
                : flowCards.Controls.Count;

        flowCards.Controls.Add(_cardPlaceholder);
        if (flowCards.Controls.GetChildIndex(_cardPlaceholder) != targetIdx)
            flowCards.Controls.SetChildIndex(_cardPlaceholder, targetIdx);

        flowCards.ResumeLayout(false);
        flowCards.PerformLayout();
    }

    public void HideCardDropIndicator()
    {
        _lastCardDropInsertIdx = -1;
        if (_cardPlaceholder != null && flowCards.Controls.Contains(_cardPlaceholder))
            flowCards.Controls.Remove(_cardPlaceholder);
    }

    // ── Hit testing ────────────────────────────────────────────────

    public bool ContainsScreenPoint(Point screenPos)
        => RectangleToScreen(ClientRectangle).Contains(screenPos);

    public int GetCardInsertIndexFromScreen(Point screenPos)
    {
        var localPos = flowCards.PointToClient(screenPos);
        var cards = flowCards.Controls.OfType<KanbanCardControl>().Where(c => c.Visible).ToList();
        for (int i = 0; i < cards.Count; i++)
        {
            if (localPos.Y < cards[i].Top + cards[i].Height / 2)
                return i;
        }
        return cards.Count;
    }

    // ── Header display ─────────────────────────────────────────────

    public void UpdateHeader()
    {
        var bgColor = ColorTranslator.FromHtml(_column.HeaderColorHex);
        panelHeader.BackColor = bgColor;

        double lum = (0.299 * bgColor.R + 0.587 * bgColor.G + 0.114 * bgColor.B) / 255;
        var textColor = lum < 0.5 ? Color.White : Color.Black;
        lblColumnName.ForeColor = textColor;
        btnColumnMenu.ForeColor = textColor;

        lblColumnName.Text = $"{_column.Name}  ({_column.Cards.Count})";

        menuCompletionToggle.Text = _column.IsCompletionColumn
            ? "완료 컬럼 해제"
            : "완료 컬럼으로 설정";
    }

    // ── Card management ────────────────────────────────────────────

    public void LoadCards()
    {
        var existing = flowCards.Controls.OfType<KanbanCardControl>().ToArray();
        flowCards.Controls.Clear();
        foreach (var c in existing) c.Dispose();

        foreach (var card in _column.Cards)
            CreateCardControl(card);

        UpdateCardWidths();
    }

    private KanbanCardControl CreateCardControl(KanbanCard card)
    {
        var ctrl = new KanbanCardControl(card);

        int w = flowCards.ClientSize.Width
                - flowCards.Padding.Left - flowCards.Padding.Right - 6;
        ctrl.Width = w > 60 ? w : 200;

        ctrl.CardDoubleClicked += OnCardDoubleClicked;
        ctrl.CardDeleted       += OnCardDeleted;
        ctrl.CardDragStarted   += (s, e) => CardDragStarted?.Invoke(s, e);
        ctrl.CardDragging      += (s, e) => CardDragging?.Invoke(s, e);
        ctrl.CardDragEnded     += (s, e) => CardDragEnded?.Invoke(s, e);

        flowCards.Controls.Add(ctrl);
        return ctrl;
    }

    public void AddCard(KanbanCard card)
    {
        _column.Cards.Add(card);
        CreateCardControl(card);
        UpdateCardWidths();
        UpdateHeader();
    }

    public void RemoveCard(KanbanCard card)
    {
        _column.Cards.Remove(card);
        var toRemove = flowCards.Controls
            .OfType<KanbanCardControl>()
            .FirstOrDefault(c => c.Card.Id == card.Id);
        if (toRemove != null)
        {
            flowCards.Controls.Remove(toRemove);
            toRemove.Dispose();
        }
        UpdateHeader();
    }

    private void OnCardDoubleClicked(object? sender, KanbanCard card)
    {
        BeforeProjectChange?.Invoke(this, EventArgs.Empty);
        using var form = new Forms.CardEditForm(card);
        if (form.ShowDialog() == DialogResult.OK)
        {
            var ctrl = flowCards.Controls
                .OfType<KanbanCardControl>()
                .FirstOrDefault(c => c.Card.Id == card.Id);
            ctrl?.UpdateDisplay();
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

    // ── Column header drag ─────────────────────────────────────────

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

    // ── Button / Menu handlers ─────────────────────────────────────

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
