using MyAgileBoardWinV10.Models;

namespace MyAgileBoardWinV10.Controls;

public partial class KanbanCardControl : UserControl
{
    private KanbanCard _card;
    private Point _dragStartScreen;
    private bool _isDragging = false;

    public KanbanCard Card => _card;

    public event EventHandler<KanbanCard>? CardDoubleClicked;
    public event EventHandler<KanbanCard>? CardDeleted;

    // Card drag events: sender = this (KanbanCardControl)
    public event EventHandler<(KanbanCard Card, Point ScreenPos)>? CardDragStarted;
    public event EventHandler<(KanbanCard Card, Point ScreenPos)>? CardDragging;
    public event EventHandler<(KanbanCard Card, Point ScreenPos)>? CardDragEnded;

    public KanbanCardControl(KanbanCard card)
    {
        _card = card;
        InitializeComponent();
        SetupIcons();
        UpdateDisplay();
        SetupDragSource();
    }

    private void SetupIcons()
    {
        menuEdit.Image = Utils.IconFactory.Get("edit");
        menuDelete.Image = Utils.IconFactory.Get("delete");
    }

    public void UpdateDisplay()
    {
        panelCard.BackColor = _card.CardColor;

        lblTitle.Text = _card.Title;

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

        if (!string.IsNullOrEmpty(_card.Description))
        {
            toolTip.SetToolTip(this, _card.Description);
            toolTip.SetToolTip(panelCard, _card.Description);
            toolTip.SetToolTip(lblTitle, _card.Description);
        }

        AdjustHeight();
    }

    private void AdjustHeight()
    {
        int h = 52;
        if (lblAssignee.Visible) h += 16;
        if (lblDueDate.Visible) h += 16;
        if (lblTags.Visible) h += 16;
        Height = h + 4;
    }

    private static Color GetPriorityColor(Priority p) => p switch
    {
        Priority.Critical => Color.Red,
        Priority.High => Color.OrangeRed,
        Priority.Medium => Color.DarkOrange,
        Priority.Low => Color.SeaGreen,
        _ => Color.Gray
    };

    // ── Drag source (capture-based, no WinForms DnD) ─────────────

    private void SetupDragSource()
    {
        panelCard.Paint      += PanelCard_StickyEffect;

        // panelCard captures the mouse on MouseDown and routes all
        // subsequent move/up events through itself even when mouse
        // travels outside its bounds.
        panelCard.MouseDown += Card_MouseDown;
        panelCard.MouseMove += PanelCard_MouseMove;
        panelCard.MouseUp   += PanelCard_MouseUp;

        // Forward child-label MouseDown so capture starts from any press
        lblTitle.MouseDown    += Card_MouseDown;
        lblPriority.MouseDown += Card_MouseDown;
        lblAssignee.MouseDown += Card_MouseDown;
        lblDueDate.MouseDown  += Card_MouseDown;
        lblTags.MouseDown     += Card_MouseDown;
    }

    private void Card_MouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left) return;
        _dragStartScreen = Cursor.Position;
        _isDragging = false;
        panelCard.Capture = true;
    }

    private void PanelCard_MouseMove(object? sender, MouseEventArgs e)
    {
        if (!panelCard.Capture || e.Button != MouseButtons.Left) return;
        var pos = Cursor.Position;
        if (!_isDragging)
        {
            if (Math.Abs(pos.X - _dragStartScreen.X) > 6 ||
                Math.Abs(pos.Y - _dragStartScreen.Y) > 6)
            {
                _isDragging = true;
                CardDragStarted?.Invoke(this, (_card, pos));
            }
        }
        if (_isDragging)
            CardDragging?.Invoke(this, (_card, pos));
    }

    private void PanelCard_MouseUp(object? sender, MouseEventArgs e)
    {
        panelCard.Capture = false;
        if (_isDragging)
        {
            _isDragging = false;
            CardDragEnded?.Invoke(this, (_card, Cursor.Position));
        }
    }

    // ── Sticky-note corner fold effect ────────────────────────────

    private void PanelCard_StickyEffect(object? sender, PaintEventArgs e)
    {
        const int fold = 12;
        var g = e.Graphics;
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        var r = panelCard.ClientRectangle;

        // Shadowed triangle (where the paper is "folded away")
        using var shadowBrush = new SolidBrush(Color.FromArgb(70, 0, 0, 0));
        g.FillPolygon(shadowBrush, new Point[]
        {
            new(r.Right - fold - 1, r.Top),
            new(r.Right - 1,        r.Top),
            new(r.Right - 1,        r.Top + fold)
        });

        // Folded-over triangle (lighter version of card color)
        var base_ = panelCard.BackColor;
        var foldColor = Color.FromArgb(
            Math.Min(base_.R + 50, 255),
            Math.Min(base_.G + 50, 255),
            Math.Min(base_.B + 50, 255));
        using var foldBrush = new SolidBrush(foldColor);
        g.FillPolygon(foldBrush, new Point[]
        {
            new(r.Right - fold - 1, r.Top),
            new(r.Right - fold - 1, r.Top + fold),
            new(r.Right - 1,        r.Top + fold)
        });

        // Fold crease line
        using var creasePen = new Pen(Color.FromArgb(120, 0, 0, 0), 1f);
        g.DrawLine(creasePen,
            r.Right - fold - 1, r.Top,
            r.Right - 1,        r.Top + fold);
    }

    // ── Double-click / context menu ────────────────────────────────

    private void panelCard_DoubleClick(object sender, EventArgs e)
        => CardDoubleClicked?.Invoke(this, _card);

    private void lblTitle_DoubleClick(object sender, EventArgs e)
        => CardDoubleClicked?.Invoke(this, _card);

    private void menuEdit_Click(object sender, EventArgs e)
        => CardDoubleClicked?.Invoke(this, _card);

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
