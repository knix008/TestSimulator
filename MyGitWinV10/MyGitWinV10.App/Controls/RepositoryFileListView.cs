using System.ComponentModel;
using System.Drawing.Text;
using MyGitWinV10.App.Services;

namespace MyGitWinV10.App.Controls;

/// <summary>
/// Renders the lazily-loaded TreeNode hierarchy built by RepositoryFileTreeService as an
/// indented two-column tree-list ("Directory/File" + "Status") with a fixed header and an
/// independently-scrolling body — the same split-panel architecture as CommitGraphView.
/// </summary>
[ToolboxItem(true)]
public sealed class RepositoryFileListView : Panel
{
    private const int RowHeight = 26;
    private const int HeaderHeight = 30;
    private const int IndentUnit = 16;
    private const int IconSize = 16;
    private const int IconTextGap = 4;
    private const float StatusBadgeFontSizeBoost = 4f;
    private const float StatusBadgeMinimumFontSize = 13f;
    private const float SymbolBadgeFontSizeBoost = 6.5f;
    private const float SymbolBadgeMinimumFontSize = 16f;
    private const int MinNameColumnWidth = 80;
    private const int MinStatusColumnWidth = 80;
    private const int ColumnResizeHitWidth = 6;

    private static readonly Color ConnectorLineColor = Color.FromArgb(200, 202, 210);
    private static readonly Color RowSeparatorColor = Color.FromArgb(210, 212, 218);
    private static readonly Color SelectionColor = Color.FromArgb(219, 234, 254);

    private static readonly StringFormat StatusColumnTextFormat = new()
    {
        Alignment = StringAlignment.Center,
        LineAlignment = StringAlignment.Center,
        Trimming = StringTrimming.None,
        FormatFlags = StringFormatFlags.NoWrap,
    };

    private readonly HashSet<TreeNode> _expanded = [];
    private readonly List<RowVisual> _rows = [];
    private readonly ToolTip _toolTip = new() { InitialDelay = 300, ReshowDelay = 100, AutoPopDelay = 8000 };
    private string? _activeToolTip;
    private bool _resizingNameColumn;
    private bool _scrollToTopPending;
    private int _resizeStartMouseX;
    private int _resizeStartWidth;

    private DoubleBufferedPanel? _headerPanel;
    private DoubleBufferedPanel? _bodyPanel;

    public RepositoryFileListView()
    {
        DoubleBuffered = true;
        BackColor = Color.FromArgb(250, 250, 251);
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);

        if (!DesignMode)
        {
            InitializeScrollPanels();
        }
    }

    // Whatever causes the outer control's own size/position to settle late (sibling Dock=Top
    // labels, split-container restores, etc.), re-deriving the scroll range and forcing a
    // repaint on every layout pass of THIS control — not just _bodyPanel's own Resize — means
    // the row list always reflects the latest real geometry instead of a stale one captured
    // too early.
    protected override void OnLayout(LayoutEventArgs levent)
    {
        base.OnLayout(levent);
        if (!DesignMode)
        {
            UpdateScrollContentSize();
            if (_scrollToTopPending && _bodyPanel is not null)
            {
                _bodyPanel.AutoScrollPosition = Point.Empty;
                _scrollToTopPending = false;
            }

            InvalidateView();
        }
    }

    /// <summary>Raised when a collapsed directory with only a placeholder child is expanded,
    /// so the caller can lazily load its real children before the row list is rebuilt.</summary>
    public event EventHandler<TreeNode>? NodeExpanding;

    public event EventHandler<TreeNode>? NodeDoubleClicked;

    public event EventHandler<TreeNode?>? SelectedNodeChanged;

    /// <summary>Resolves the Git status (badge letter + color) to show in the Status column
    /// for a given node. Set by the owner once the status index is available.</summary>
    public Func<TreeNode, PathGitStatus?>? StatusResolver { get; set; }

    /// <summary>Icons keyed by TreeNode.ImageIndex, as built by GitFileTreeImageList.</summary>
    public ImageList? Icons { get; set; }

    [Category("Appearance")]
    public Color HeaderBackColor { get; set; } = Color.FromArgb(248, 250, 252);

    [Category("Appearance")]
    public Color HeaderForeColor { get; set; } = Color.FromArgb(51, 65, 85);

    [Category("Appearance")]
    public Color HeaderAccentColor { get; set; } = Color.FromArgb(100, 116, 139);

    [Category("Appearance")]
    public Color HeaderBorderColor { get; set; } = Color.FromArgb(226, 232, 240);

    [Category("Appearance")]
    public string NameColumnText { get; set; } = "Directory/File";

    [Category("Layout")]
    public int NameColumnWidth { get; set; } = 220;

    [Category("Appearance")]
    public string StatusColumnText { get; set; } = "Status";

    public TreeNode? RootNode { get; private set; }

    public TreeNode? SelectedNode { get; private set; }

    private int ScrollOffsetX => _bodyPanel?.AutoScrollPosition.X ?? 0;

    // Negative when scrolled down — same convention as CommitGraphView / ScrollableControl.AutoScrollPosition.
    private int ScrollOffsetY => _bodyPanel?.AutoScrollPosition.Y ?? 0;

    private int ViewportWidth => _bodyPanel?.ClientSize.Width ?? ClientSize.Width;

    private int ViewportHeight => _bodyPanel?.ClientSize.Height ?? Math.Max(0, ClientSize.Height - HeaderHeight);

    private void InitializeScrollPanels()
    {
        _headerPanel = new DoubleBufferedPanel
        {
            Dock = DockStyle.Top,
            Height = HeaderHeight,
            BackColor = BackColor
        };

        _bodyPanel = new DoubleBufferedPanel
        {
            Dock = DockStyle.Fill,
            AutoScroll = true,
            BackColor = BackColor,
            TabStop = true
        };
        _bodyPanel.Resize += (_, _) => UpdateScrollContentSize();
        _bodyPanel.Scroll += (_, _) => _bodyPanel.Invalidate();

        // Body must be added first, header last — WinForms docks in reverse collection order,
        // so the Top header claims its strip before Fill expands; otherwise the body fills the
        // entire control and row 0 (repository root) paints underneath the column header.
        Controls.Add(_bodyPanel);
        Controls.Add(_headerPanel);

        _headerPanel.Paint += HeaderPanel_Paint;
        _headerPanel.MouseDown += HeaderPanel_MouseDown;
        _headerPanel.MouseMove += HeaderPanel_MouseMove;
        _headerPanel.MouseUp += (_, _) => EndColumnResize();
        _headerPanel.MouseLeave += (_, _) =>
        {
            if (!_resizingNameColumn)
            {
                _headerPanel!.Cursor = Cursors.Default;
            }
        };
        _bodyPanel.Paint += BodyPanel_Paint;
        _bodyPanel.MouseDown += BodyPanel_MouseDown;
        _bodyPanel.MouseClick += BodyPanel_MouseClick;
        _bodyPanel.MouseDoubleClick += BodyPanel_MouseDoubleClick;
        _bodyPanel.MouseMove += BodyPanel_MouseMove;
        _bodyPanel.MouseLeave += (_, _) => HideToolTip();
    }

    private void UpdateScrollContentSize()
    {
        if (_bodyPanel is null)
        {
            return;
        }

        int contentHeight = Math.Max(0, _rows.Count * RowHeight);
        int contentWidth = Math.Max(ViewportWidth, ContentWidth);
        _bodyPanel.AutoScrollMinSize = new Size(contentWidth, contentHeight);

        int maxScroll = Math.Max(0, contentHeight - ViewportHeight);
        int currentScroll = -ScrollOffsetY;
        if (currentScroll > maxScroll)
        {
            _bodyPanel.AutoScrollPosition = new Point(0, maxScroll);
        }
    }

    public override ContextMenuStrip? ContextMenuStrip
    {
        get => base.ContextMenuStrip;
        set
        {
            base.ContextMenuStrip = value;
            if (_bodyPanel is not null)
            {
                _bodyPanel.ContextMenuStrip = value;
            }
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _toolTip.Dispose();
        }

        base.Dispose(disposing);
    }

    public void SetRoot(TreeNode? root)
    {
        RootNode = root;
        _expanded.Clear();
        if (root is not null)
        {
            _expanded.Add(root);
        }

        SelectedNode = null;
        // Defer scroll reset until layout settles — sibling Dock=Top labels and split-container
        // restores can leave a stale scroll offset that hides row 0 (the repository root).
        _scrollToTopPending = true;
        if (_bodyPanel is not null)
        {
            _bodyPanel.AutoScrollPosition = Point.Empty;
        }

        Rebuild();
    }

    public void RebuildPreservingSelection()
    {
        TreeNode? selected = SelectedNode;
        Rebuild();
        if (selected is not null)
        {
            SelectNode(selected);
        }
    }

    public void SelectNode(TreeNode node)
    {
        int index = _rows.FindIndex(r => ReferenceEquals(r.Node, node));
        if (index < 0)
        {
            return;
        }

        SelectedNode = node;
        EnsureVisible(index);
        InvalidateView();
        SelectedNodeChanged?.Invoke(this, node);
    }

    private void EnsureVisible(int rowIndex)
    {
        if (_bodyPanel is null)
        {
            return;
        }

        int rowTop = rowIndex * RowHeight;
        int rowBottom = rowTop + RowHeight;
        int viewTop = -ScrollOffsetY;
        int viewBottom = viewTop + ViewportHeight;

        if (rowTop < viewTop)
        {
            _bodyPanel.AutoScrollPosition = new Point(0, rowTop);
        }
        else if (rowBottom > viewBottom)
        {
            _bodyPanel.AutoScrollPosition = new Point(0, rowBottom - ViewportHeight);
        }
    }

    private void InvalidateView()
    {
        if (DesignMode)
        {
            Invalidate();
            return;
        }

        _headerPanel?.Invalidate();
        _bodyPanel?.Invalidate();
    }

    private void Rebuild()
    {
        _rows.Clear();
        if (RootNode is not null)
        {
            AddVisible(RootNode, 0, [], isLastSibling: true);
        }

        UpdateScrollContentSize();
        InvalidateView();
    }

    private void AddVisible(TreeNode node, int depth, IReadOnlyList<bool> ancestorContinues, bool isLastSibling)
    {
        bool isPlaceholder = node.Tag is RepositoryFileNodeTag { IsPlaceholder: true };
        bool canExpand = !isPlaceholder && IsExpandableDirectory(node);

        PathGitStatus? status = isPlaceholder ? null : StatusResolver?.Invoke(node);
        _rows.Add(new RowVisual(node, depth, ancestorContinues, isLastSibling, canExpand, _expanded.Contains(node), status));

        if (_expanded.Contains(node))
        {
            var children = node.Nodes.Cast<TreeNode>().ToList();
            // The root (depth 0) never gets its own connector column — only nodes from depth 1
            // onward have an "own level" elbow rendered, so only they contribute a real
            // continuation flag for their children's ancestor-line lookups. Appending one for
            // the root would shift every deeper level's column index off by one, leaving the
            // genuine ancestor flags unread and the lines looking disconnected.
            var childContinues = depth == 0
                ? ancestorContinues
                : new List<bool>(ancestorContinues) { !isLastSibling };
            for (int i = 0; i < children.Count; i++)
            {
                AddVisible(children[i], depth + 1, childContinues, isLastSibling: i == children.Count - 1);
            }
        }
    }

    private static bool CanToggleExpand(TreeNode node) =>
        node.Nodes.Count > 0;

    private static bool HasOnlyPlaceholderChild(TreeNode node) =>
        node.Nodes.Count == 1 && node.Nodes[0].Tag is RepositoryFileNodeTag { IsPlaceholder: true };

    private static bool IsExpandableDirectory(TreeNode node) =>
        node.Tag is RepositoryFileNodeTag { IsDirectory: true, IsPlaceholder: false } && CanToggleExpand(node);

    /// <summary>Clicking a directory row toggles it open/closed, like a real tree view.</summary>
    private void ToggleExpand(TreeNode node)
    {
        if (!IsExpandableDirectory(node))
        {
            return;
        }

        if (_expanded.Contains(node))
        {
            _expanded.Remove(node);
        }
        else
        {
            _expanded.Add(node);
            if (HasOnlyPlaceholderChild(node))
            {
                NodeExpanding?.Invoke(this, node);
            }
        }

        RebuildPreservingSelection();
    }

    private int RowIndexAt(int clientY)
    {
        int documentY = clientY - ScrollOffsetY;
        int index = documentY / RowHeight;
        return index >= 0 && index < _rows.Count ? index : -1;
    }

    private bool IsNearColumnDivider(int x) =>
        Math.Abs(x - (ScrollOffsetX + NameColumnWidth)) <= ColumnResizeHitWidth;

    private void HeaderPanel_MouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left || !IsNearColumnDivider(e.X))
        {
            return;
        }

        _resizingNameColumn = true;
        _resizeStartMouseX = e.X;
        _resizeStartWidth = NameColumnWidth;
        _headerPanel!.Capture = true;
    }

    private void HeaderPanel_MouseMove(object? sender, MouseEventArgs e)
    {
        if (_resizingNameColumn)
        {
            int delta = e.X - _resizeStartMouseX;
            NameColumnWidth = Math.Max(MinNameColumnWidth, _resizeStartWidth + delta);
            InvalidateView();
            return;
        }

        _headerPanel!.Cursor = IsNearColumnDivider(e.X) ? Cursors.VSplit : Cursors.Default;
    }

    private void EndColumnResize()
    {
        if (!_resizingNameColumn)
        {
            return;
        }

        _resizingNameColumn = false;
        if (_headerPanel is not null)
        {
            _headerPanel.Capture = false;
        }
    }

    private void SelectRowAt(int clientY)
    {
        int index = RowIndexAt(clientY);
        if (index < 0)
        {
            return;
        }

        SelectedNode = _rows[index].Node;
        InvalidateView();
        SelectedNodeChanged?.Invoke(this, SelectedNode);
    }

    private void BodyPanel_MouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button == MouseButtons.Right)
        {
            SelectRowAt(e.Y);
        }
    }

    private void BodyPanel_MouseClick(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left)
        {
            return;
        }

        int index = RowIndexAt(e.Y);
        if (index < 0)
        {
            return;
        }

        SelectedNode = _rows[index].Node;
        InvalidateView();
        SelectedNodeChanged?.Invoke(this, SelectedNode);
        ToggleExpand(_rows[index].Node);
    }

    private void BodyPanel_MouseDoubleClick(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left)
        {
            return;
        }

        int index = RowIndexAt(e.Y);
        if (index < 0)
        {
            return;
        }

        TreeNode node = _rows[index].Node;
        SelectedNode = node;
        InvalidateView();
        SelectedNodeChanged?.Invoke(this, node);
        NodeDoubleClicked?.Invoke(this, node);
    }

    private void BodyPanel_MouseMove(object? sender, MouseEventArgs e)
    {
        int index = RowIndexAt(e.Y);
        string? tip = index >= 0 ? _rows[index].Node.ToolTipText : null;
        if (string.IsNullOrEmpty(tip))
        {
            HideToolTip();
            return;
        }

        if (tip == _activeToolTip)
        {
            return;
        }

        _activeToolTip = tip;
        _toolTip.Show(tip, _bodyPanel!, e.X + 16, e.Y + 16, 8000);
    }

    private void HideToolTip()
    {
        if (_activeToolTip is null)
        {
            return;
        }

        _activeToolTip = null;
        _toolTip.Hide(_bodyPanel ?? (Control)this);
    }

    private int ContentWidth => NameColumnWidth + EffectiveStatusColumnWidth(ViewportWidth);

    private static int EffectiveStatusColumnWidth(int viewportWidth, int nameColumnWidth) =>
        Math.Max(MinStatusColumnWidth, viewportWidth - nameColumnWidth);

    private int EffectiveStatusColumnWidth(int viewportWidth) =>
        EffectiveStatusColumnWidth(viewportWidth, NameColumnWidth);

    private static Rectangle GetStatusColumnBounds(int dividerX, int top, int height, int statusColumnWidth) =>
        new(dividerX, top, statusColumnWidth, height);

    private void BodyPanel_Paint(object? sender, PaintEventArgs e)
    {
        Graphics g = e.Graphics;
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.None;

        int offsetX = ScrollOffsetX;
        int offsetY = ScrollOffsetY;
        int viewportHeight = ViewportHeight;
        int viewportWidth = ViewportWidth;
        int contentRight = offsetX + ContentWidth;
        int dividerX = offsetX + NameColumnWidth;
        int statusColumnWidth = EffectiveStatusColumnWidth(viewportWidth);

        using var selectionBrush = new SolidBrush(SelectionColor);
        using var backgroundBrush = new SolidBrush(BackColor);
        using var linePen = new Pen(ConnectorLineColor);
        using var textBrush = new SolidBrush(ForeColor);
        using var rowSeparatorPen = new Pen(RowSeparatorColor);
        using var columnDividerPen = new Pen(HeaderBorderColor);

        for (int i = 0; i < _rows.Count; i++)
        {
            RowVisual row = _rows[i];
            int rowTop = offsetY + i * RowHeight;
            int rowBottom = rowTop + RowHeight;
            if (rowBottom <= 0 || rowTop > viewportHeight)
            {
                continue;
            }

            bool isSelected = ReferenceEquals(row.Node, SelectedNode);
            Color rowBackColor = isSelected ? SelectionColor : BackColor;
            g.FillRectangle(isSelected ? selectionBrush : backgroundBrush, 0, rowTop, viewportWidth, RowHeight);

            DrawNameCell(g, row, offsetX, rowTop, linePen, textBrush, rowBackColor);
            DrawStatusCell(g, row, dividerX, rowTop, statusColumnWidth, rowBackColor);
        }

        int gridTop = Math.Max(0, offsetY);
        int gridBottom = Math.Min(viewportHeight, offsetY + _rows.Count * RowHeight);
        if (gridBottom > gridTop)
        {
            for (int i = 0; i <= _rows.Count; i++)
            {
                int y = offsetY + i * RowHeight;
                if (y < 0 || y > viewportHeight)
                {
                    continue;
                }

                int lineLeft = Math.Max(0, offsetX);
                int lineRight = Math.Max(viewportWidth, contentRight);
                g.DrawLine(rowSeparatorPen, lineLeft, y, lineRight, y);
            }

            if (dividerX > 0 && dividerX < viewportWidth)
            {
                g.DrawLine(columnDividerPen, dividerX, gridTop, dividerX, gridBottom);
            }
        }
    }

    private void DrawNameCell(Graphics g, RowVisual row, int offsetX, int rowTop, Pen linePen, SolidBrush textBrush, Color rowBackColor)
    {
        int x = offsetX;
        int rowBottom = rowTop + RowHeight;
        int midY = rowTop + RowHeight / 2;

        for (int level = 0; level < row.Depth; level++)
        {
            int lineX = x + level * IndentUnit + IndentUnit / 2;
            bool isOwnLevel = level == row.Depth - 1;

            if (isOwnLevel)
            {
                g.DrawLine(linePen, lineX, rowTop, lineX, row.IsLastSibling ? midY : rowBottom);
                g.DrawLine(linePen, lineX, midY, lineX + IndentUnit / 2, midY);
            }
            else if (level < row.AncestorContinues.Count && row.AncestorContinues[level])
            {
                g.DrawLine(linePen, lineX, rowTop, lineX, rowBottom);
            }
        }

        int cursorX = x + row.Depth * IndentUnit;

        if (row.CanExpand)
        {
            string glyph = row.IsExpanded ? "▾" : "▸";
            var glyphRect = new Rectangle(cursorX, rowTop, IndentUnit, RowHeight);
            TextRenderer.DrawText(g, glyph, Font, glyphRect, SystemColors.ControlDarkDark, rowBackColor, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPrefix);
        }

        cursorX += IndentUnit;

        if (Icons is not null && row.Node.ImageIndex >= 0 && row.Node.ImageIndex < Icons.Images.Count)
        {
            Image icon = Icons.Images[row.Node.ImageIndex];
            int iconY = rowTop + Math.Max(0, (RowHeight - icon.Height) / 2);
            g.DrawImage(icon, cursorX, iconY, icon.Width, icon.Height);
            cursorX += icon.Width + IconTextGap;
        }

        var textRect = new Rectangle(cursorX, rowTop, Math.Max(0, x + NameColumnWidth - cursorX), RowHeight);
        TextRenderer.DrawText(
            g,
            row.Node.Text,
            Font,
            textRect,
            row.Node.ForeColor.IsEmpty ? textBrush.Color : row.Node.ForeColor,
            rowBackColor,
            TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.NoPrefix | TextFormatFlags.EndEllipsis);
    }

    private void DrawStatusCell(Graphics g, RowVisual row, int dividerX, int rowTop, int statusColumnWidth, Color rowBackColor)
    {
        if (row.Status is not { HasChanges: true } status)
        {
            return;
        }

        Rectangle columnBounds = GetStatusColumnBounds(dividerX, rowTop, RowHeight, statusColumnWidth);
        float badgeFontSize = GetStatusBadgeFontSize(status.Badge);
        using var badgeFont = new Font(Font.FontFamily, badgeFontSize, FontStyle.Bold, GraphicsUnit.Point);

        var previousHint = g.TextRenderingHint;
        g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
        DrawStatusColumnText(g, status.Badge, badgeFont, columnBounds, status.ForeColor);
        g.TextRenderingHint = previousHint;
    }

    private static void DrawStatusColumnText(
        Graphics g,
        string text,
        Font font,
        Rectangle columnBounds,
        Color foreColor)
    {
        if (columnBounds.Width <= 0 || columnBounds.Height <= 0)
        {
            return;
        }

        using var foreBrush = new SolidBrush(foreColor);
        g.DrawString(text, font, foreBrush, columnBounds, StatusColumnTextFormat);
    }

    private float GetStatusBadgeFontSize(string badge) =>
        IsSymbolStatusBadge(badge)
            ? Math.Max(Font.SizeInPoints + SymbolBadgeFontSizeBoost, SymbolBadgeMinimumFontSize)
            : Math.Max(Font.SizeInPoints + StatusBadgeFontSizeBoost, StatusBadgeMinimumFontSize);

    private static bool IsSymbolStatusBadge(string badge) =>
        badge is "X" or PathGitStatus.ChangedBadge;

    private void HeaderPanel_Paint(object? sender, PaintEventArgs e)
    {
        Graphics g = e.Graphics;
        int offsetX = ScrollOffsetX;
        int viewportWidth = ViewportWidth;
        int dividerX = offsetX + NameColumnWidth;
        int statusColumnWidth = EffectiveStatusColumnWidth(viewportWidth);

        using (var background = new SolidBrush(HeaderBackColor))
        {
            g.FillRectangle(background, 0, 0, viewportWidth, HeaderHeight);
        }

        using (var accent = new SolidBrush(HeaderAccentColor))
        {
            g.FillRectangle(accent, offsetX, 0, 3, HeaderHeight);
        }

        var nameRect = new Rectangle(offsetX + 9, 0, Math.Max(0, NameColumnWidth - 12), HeaderHeight);
        if (nameRect.Right > 0 && nameRect.Left < viewportWidth)
        {
            TextRenderer.DrawText(
                g,
                NameColumnText,
                Font,
                nameRect,
                HeaderForeColor,
                TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.NoPrefix | TextFormatFlags.EndEllipsis);
        }

        var statusRect = GetStatusColumnBounds(dividerX, 0, HeaderHeight, statusColumnWidth);
        if (statusRect.Right > 0 && statusRect.Left < viewportWidth)
        {
            DrawStatusColumnText(g, StatusColumnText, Font, statusRect, HeaderForeColor);
        }

        using (var border = new Pen(HeaderBorderColor))
        {
            g.DrawLine(border, 0, HeaderHeight - 1, viewportWidth - 1, HeaderHeight - 1);
            if (dividerX > 0 && dividerX < viewportWidth)
            {
                g.DrawLine(border, dividerX, 0, dividerX, HeaderHeight - 1);
            }
        }
    }

    private sealed class DoubleBufferedPanel : Panel
    {
        public DoubleBufferedPanel()
        {
            DoubleBuffered = true;
            ResizeRedraw = true;
            SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);
        }
    }

    private readonly record struct RowVisual(
        TreeNode Node,
        int Depth,
        IReadOnlyList<bool> AncestorContinues,
        bool IsLastSibling,
        bool CanExpand,
        bool IsExpanded,
        PathGitStatus? Status);
}
