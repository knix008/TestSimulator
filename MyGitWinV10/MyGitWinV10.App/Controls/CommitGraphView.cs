using System.ComponentModel;
using System.Drawing.Drawing2D;
using LibGit2Sharp;
using MyGitWinV10.App.Services;

namespace MyGitWinV10.App.Controls;

[ToolboxItem(true)]
public class CommitGraphView : Panel
{
    private const int RowHeight = 24;
    private const int HeaderHeight = 28;
    private const int LaneWidth = 18;
    private const int LeftMargin = 12;
    private const int DotRadius = 4;
    private const int DefaultMessageColumnWidth = 300;
    private const int DefaultShaColumnWidth = 72;
    private const int DefaultAuthorColumnWidth = 150;
    private const int DefaultDateColumnWidth = 96;
    private const int MinGraphColumnWidth = 56;
    private const int MinMessageColumnWidth = 80;
    private const int MinShaColumnWidth = 56;
    private const int MinAuthorColumnWidth = 80;
    private const int MinDateColumnWidth = 72;
    private const int ColumnResizeHitWidth = 8;

    private static readonly Color[] LanePalette =
    {
        Color.FromArgb(37, 99, 235), Color.FromArgb(220, 38, 38), Color.FromArgb(5, 150, 105),
        Color.FromArgb(217, 119, 6), Color.FromArgb(124, 58, 237), Color.FromArgb(8, 145, 178)
    };

    private static readonly Color LaneGridColor = Color.FromArgb(218, 220, 225);
    private static readonly Color RowSeparatorColor = Color.FromArgb(210, 212, 218);
    private static readonly Color TextColumnSeparatorColor = Color.FromArgb(200, 202, 210);
    private static readonly SectionTitleTheme CommitHistoryHeaderTheme = SectionTitleTheme.For(SectionTitleKind.CommitHistory);
    private static readonly Color AlternatingRowColor = Color.FromArgb(252, 252, 253);

    private static readonly ColumnHeader[] StaticColumnHeaders =
    [
        new("Graph", "Branch and merge graph showing how commits connect across lanes.", 0, 0),
        new("Message", "Short summary of the commit (first line of the commit message).", 0, DefaultMessageColumnWidth),
        new("SHA", "Abbreviated commit hash that uniquely identifies this revision.", 0, DefaultShaColumnWidth),
        new("Author", "Person who authored the commit.", 0, DefaultAuthorColumnWidth),
        new("Date", "Date when the commit was authored.", 0, DefaultDateColumnWidth)
    ];

    private int[] _columnWidths = [MinGraphColumnWidth, DefaultMessageColumnWidth, DefaultShaColumnWidth, DefaultAuthorColumnWidth, DefaultDateColumnWidth];
    private int _resizeColumnIndex = -1;
    private int _resizeStartMouseX;
    private int _resizeStartWidth;

    private List<CommitRow> _rows = new();
    private int _textColumnX = MinGraphColumnWidth;
    private int _messageColumnX;
    private int _shaColumnX;
    private int _authorColumnX;
    private int _dateColumnX;
    private int _maxLaneIndex;
    private Commit? _selectedCommit;
    private readonly ToolTip _toolTip = new() { InitialDelay = 300, ReshowDelay = 100, AutoPopDelay = 8000 };
    private string? _activeToolTip;
    private ColumnHeader[] _columnHeaders = StaticColumnHeaders;

    private DoubleBufferedPanel? _headerPanel;
    private DoubleBufferedPanel? _bodyPanel;

    public event EventHandler<Commit>? CommitSelected;

    /// <summary>Raised when column widths change. The bool argument is true only when the
    /// user dragged a header divider — callers should not resize the history/detail
    /// splitter for that case, since widening Date (or any column) manually must not
    /// drag the splitter along with it.</summary>
    public event EventHandler<bool>? ColumnLayoutChanged;

    public int ListContentWidth => ContentWidth;

    public Commit? SelectedCommit => _selectedCommit;

    [Category("Layout")]
    [DefaultValue(DefaultMessageColumnWidth)]
    [Description("Width, in pixels, of the Message column heading.")]
    public int MessageColumnWidth
    {
        get => _columnWidths[1];
        set => SetColumnWidth(1, value);
    }

    [Category("Layout")]
    [DefaultValue(DefaultShaColumnWidth)]
    [Description("Width, in pixels, of the SHA column heading.")]
    public int ShaColumnWidth
    {
        get => _columnWidths[2];
        set => SetColumnWidth(2, value);
    }

    [Category("Layout")]
    [DefaultValue(DefaultAuthorColumnWidth)]
    [Description("Width, in pixels, of the Author column heading.")]
    public int AuthorColumnWidth
    {
        get => _columnWidths[3];
        set => SetColumnWidth(3, value);
    }

    [Category("Layout")]
    [DefaultValue(DefaultDateColumnWidth)]
    [Description("Width, in pixels, of the Date column heading.")]
    public int DateColumnWidth
    {
        get => _columnWidths[4];
        set => SetColumnWidth(4, value);
    }

    private void SetColumnWidth(int columnIndex, int width)
    {
        int clamped = Math.Max(GetMinColumnWidth(columnIndex), width);
        if (_columnWidths[columnIndex] == clamped)
        {
            return;
        }

        _columnWidths[columnIndex] = clamped;
        RecalculateColumnLayout(notifyLayoutChanged: false);
        InvalidateView();
    }

    public CommitGraphView()
    {
        DoubleBuffered = true;
        BackColor = Color.FromArgb(250, 250, 251);
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);

        // Headers otherwise stay at their StaticColumnHeaders X=0 default (all stacked
        // on top of each other) until SetRows is first called, which doesn't happen
        // in the Designer or before a repository is opened.
        RecalculateColumnLayout(notifyLayoutChanged: false);

        if (!DesignMode)
        {
            InitializeScrollPanels();
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

    private int ScrollOffsetX => _bodyPanel?.AutoScrollPosition.X ?? 0;

    private int ScrollOffsetY => _bodyPanel?.AutoScrollPosition.Y ?? 0;

    private int ViewportWidth => _bodyPanel?.ClientSize.Width ?? ClientSize.Width;

    private int ViewportHeight => _bodyPanel?.ClientSize.Height ?? Math.Max(0, ClientSize.Height - HeaderHeight);

    private void InitializeScrollPanels()
    {
        _bodyPanel = new DoubleBufferedPanel
        {
            Dock = DockStyle.Fill,
            AutoScroll = true,
            BackColor = BackColor,
            TabStop = true
        };
        _headerPanel = new DoubleBufferedPanel
        {
            Dock = DockStyle.Top,
            Height = HeaderHeight,
            BackColor = BackColor
        };

        Controls.Add(_bodyPanel);
        Controls.Add(_headerPanel);

        _headerPanel.Paint += HeaderPanel_Paint;
        _bodyPanel.Paint += BodyPanel_Paint;
        _bodyPanel.Scroll += BodyPanel_Scroll;

        _headerPanel.MouseDown += HeaderPanel_MouseDown;
        _headerPanel.MouseMove += HeaderPanel_MouseMove;
        _headerPanel.MouseUp += HeaderPanel_MouseUp;
        _headerPanel.MouseLeave += HeaderPanel_MouseLeave;

        _bodyPanel.MouseMove += BodyPanel_MouseMove;
        _bodyPanel.MouseUp += BodyPanel_MouseUp;
        _bodyPanel.MouseDown += BodyPanel_MouseDown;
        _bodyPanel.MouseClick += BodyPanel_MouseClick;
        _bodyPanel.MouseLeave += BodyPanel_MouseLeave;
    }

    protected override void OnLayout(LayoutEventArgs levent)
    {
        base.OnLayout(levent);
        _headerPanel?.Invalidate();
    }

    private void BodyPanel_Scroll(object? sender, ScrollEventArgs e)
    {
        if (e.ScrollOrientation == ScrollOrientation.HorizontalScroll)
        {
            _headerPanel?.Invalidate();
        }
    }

    public bool HasRows => _rows.Count > 0;

    public void SetRows(List<CommitRow> rows)
    {
        _rows = rows;
        _selectedCommit = null;
        HideHoverToolTip();

        int maxLane = 0;
        foreach (var row in rows)
        {
            maxLane = Math.Max(maxLane, row.Lane);
            foreach (var fork in row.ForkLanes)
            {
                maxLane = Math.Max(maxLane, fork);
            }

            foreach (var merge in row.MergeLanes)
            {
                maxLane = Math.Max(maxLane, merge);
            }
        }

        _textColumnX = LeftMargin + (maxLane + 1) * LaneWidth + 8;
        _maxLaneIndex = maxLane;

        int requiredGraphWidth = Math.Max(_textColumnX, MinGraphColumnWidth);
        _columnWidths[0] = Math.Max(_columnWidths[0] == 0 ? requiredGraphWidth : _columnWidths[0], requiredGraphWidth);
        RecalculateColumnLayout();

        InvalidateView();
    }

    public bool TrySelectFirstCommit()
    {
        if (_rows.Count == 0)
        {
            return false;
        }

        _selectedCommit = _rows[0].Commit;
        InvalidateView();
        CommitSelected?.Invoke(this, _selectedCommit);
        return true;
    }

    private void RecalculateColumnLayout(bool notifyLayoutChanged = true)
    {
        int x = 0;
        var headers = new ColumnHeader[_columnWidths.Length];
        for (int i = 0; i < _columnWidths.Length; i++)
        {
            headers[i] = StaticColumnHeaders[i] with { X = x, Width = _columnWidths[i] };
            x += _columnWidths[i];
        }

        _columnHeaders = headers;
        _messageColumnX = headers[1].X;
        _shaColumnX = headers[2].X;
        _authorColumnX = headers[3].X;
        _dateColumnX = headers[4].X;
        _textColumnX = _messageColumnX;

        if (_bodyPanel is not null)
        {
            _bodyPanel.AutoScrollMinSize = new Size(x, _rows.Count * RowHeight + 8);
        }

        if (notifyLayoutChanged)
        {
            ColumnLayoutChanged?.Invoke(this, false);
        }
    }

    private int ContentWidth => _columnHeaders[^1].X + _columnHeaders[^1].Width;

    private int GetMinColumnWidth(int columnIndex)
    {
        return columnIndex switch
        {
            0 => LeftMargin + (_maxLaneIndex + 1) * LaneWidth + 8,
            1 => MinMessageColumnWidth,
            2 => MinShaColumnWidth,
            3 => MinAuthorColumnWidth,
            4 => MinDateColumnWidth,
            _ => 40
        };
    }

    private int? HitTestColumnDivider(int clientX)
    {
        int documentX = clientX - ScrollOffsetX;
        for (int i = 0; i < _columnHeaders.Length - 1; i++)
        {
            int dividerX = _columnHeaders[i].X + _columnHeaders[i].Width;
            if (Math.Abs(documentX - dividerX) <= ColumnResizeHitWidth / 2)
            {
                return i;
            }
        }

        return null;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);

        if (!DesignMode)
        {
            return;
        }

        DrawHeader(e.Graphics, 0, ClientRectangle.Width);
        TextRenderer.DrawText(
            e.Graphics,
            "Commit Graph",
            Font,
            new Rectangle(0, HeaderHeight, ClientRectangle.Width, ClientRectangle.Height - HeaderHeight),
            Color.FromArgb(140, 140, 150),
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
    }

    private void HeaderPanel_Paint(object? sender, PaintEventArgs e)
    {
        DrawHeader(e.Graphics, ScrollOffsetX, ViewportWidth);

        int gutter = _headerPanel!.ClientSize.Width - ViewportWidth;
        if (gutter > 0)
        {
            using var gutterBrush = new SolidBrush(BackColor);
            e.Graphics.FillRectangle(gutterBrush, ViewportWidth, 0, gutter, HeaderHeight);
        }
    }

    private void BodyPanel_Paint(object? sender, PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;

        int offsetX = ScrollOffsetX;
        int offsetY = ScrollOffsetY;
        int height = ViewportHeight;

        using var textBrush = new SolidBrush(Color.FromArgb(30, 30, 35));
        using var metaBrush = new SolidBrush(Color.FromArgb(140, 140, 150));
        using var selectionBrush = new SolidBrush(Color.FromArgb(40, 37, 99, 235));
        using var altRowBrush = new SolidBrush(AlternatingRowColor);

        int X(int lane) => offsetX + LeftMargin + lane * LaneWidth;

        for (int i = 0; i < _rows.Count; i++)
        {
            var row = _rows[i];
            int rowTop = offsetY + i * RowHeight;
            int rowBottom = rowTop + RowHeight;

            if (rowBottom <= 0 || rowTop > height)
            {
                continue;
            }

            if (i % 2 == 1)
            {
                g.FillRectangle(altRowBrush, 0, rowTop, ViewportWidth, RowHeight);
            }

            if (ReferenceEquals(row.Commit, _selectedCommit))
            {
                g.FillRectangle(selectionBrush, 0, rowTop, ViewportWidth, RowHeight);
            }
        }

        DrawGrid(g, offsetX, offsetY, e.ClipRectangle, ViewportWidth, ViewportHeight);

        for (int i = 0; i < _rows.Count; i++)
        {
            var row = _rows[i];
            int rowTop = offsetY + i * RowHeight;
            int rowMid = rowTop + RowHeight / 2;
            int rowBottom = rowTop + RowHeight;

            if (rowBottom <= 0 || rowTop > height)
            {
                continue;
            }

            using var ownPen = new Pen(LanePalette[row.Lane % LanePalette.Length], 1.8f);
            g.DrawLine(ownPen, X(row.Lane), rowTop, X(row.Lane), rowMid);
            if (row.ContinuesDown)
            {
                g.DrawLine(ownPen, X(row.Lane), rowMid, X(row.Lane), rowBottom);
            }

            foreach (var lane in row.PassThroughLanes)
            {
                using var passPen = new Pen(LanePalette[lane % LanePalette.Length], 1.6f);
                g.DrawLine(passPen, X(lane), rowTop, X(lane), rowBottom);
            }

            foreach (var lane in row.ForkLanes)
            {
                using var forkPen = new Pen(LanePalette[lane % LanePalette.Length], 1.6f);
                g.DrawLine(forkPen, X(row.Lane), rowMid, X(lane), rowBottom);
            }

            foreach (var lane in row.MergeLanes)
            {
                using var mergePen = new Pen(LanePalette[lane % LanePalette.Length], 1.6f);
                g.DrawLine(mergePen, X(lane), rowTop, X(row.Lane), rowMid);
            }

            using var dotBrush = new SolidBrush(LanePalette[row.Lane % LanePalette.Length]);
            g.FillEllipse(dotBrush, X(row.Lane) - DotRadius, rowMid - DotRadius, DotRadius * 2, DotRadius * 2);

            DrawCell(g, row.Commit.MessageShort, offsetX + _messageColumnX, rowTop, _columnWidths[1], textBrush.Color, Font);
            DrawCell(g, row.Commit.Sha[..7], offsetX + _shaColumnX, rowTop, _columnWidths[2], metaBrush.Color, Font);
            DrawCell(g, row.Commit.Author.Name, offsetX + _authorColumnX, rowTop, _columnWidths[3], metaBrush.Color, Font);
            DrawCell(g, row.Commit.Author.When.ToString("yyyy-MM-dd"), offsetX + _dateColumnX, rowTop, _columnWidths[4], metaBrush.Color, Font);
        }
    }

    private void DrawHeader(Graphics g, int offsetX, int viewportWidth)
    {
        var theme = CommitHistoryHeaderTheme;

        using var bg = new SolidBrush(theme.Background);
        g.FillRectangle(bg, 0, 0, viewportWidth, HeaderHeight);

        using (var accent = new SolidBrush(theme.Accent))
        {
            g.FillRectangle(accent, 0, 0, 3, HeaderHeight);
        }

        using var headerFont = new Font(Font, FontStyle.Bold);
        using var border = new Pen(theme.Border);

        // Spans the full viewport (not just ContentWidth) so the header doesn't look cut
        // off mid-row when the control is wider than the last (Date) column.
        g.DrawLine(border, 0, HeaderHeight - 1, viewportWidth - 1, HeaderHeight - 1);

        for (int i = 0; i < _columnHeaders.Length; i++)
        {
            var header = _columnHeaders[i];
            var rect = new Rectangle(offsetX + header.X + 8, 0, header.Width - 12, HeaderHeight);
            if (rect.Right <= 0 || rect.Left >= viewportWidth)
            {
                continue;
            }

            TextRenderer.DrawText(
                g,
                header.Title,
                headerFont,
                rect,
                theme.Foreground,
                TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPrefix);

            if (i < _columnHeaders.Length - 1)
            {
                int separatorX = offsetX + header.X + header.Width;
                if (separatorX > 0 && separatorX < viewportWidth)
                {
                    g.DrawLine(border, separatorX, 4, separatorX, HeaderHeight - 4);
                }
            }
        }
    }

    private static void DrawCell(Graphics g, string text, int x, int rowTop, int width, Color color, Font font)
    {
        var rect = new Rectangle(x + 8, rowTop, width - 12, RowHeight);
        TextRenderer.DrawText(
            g,
            text,
            font,
            rect,
            color,
            TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPrefix);
    }

    private void DrawGrid(Graphics g, int offsetX, int offsetY, Rectangle clip, int viewportWidth, int viewportHeight)
    {
        int contentTop = offsetY;
        int contentBottom = offsetY + _rows.Count * RowHeight;
        if (contentBottom <= 0 || contentTop >= viewportHeight)
        {
            return;
        }

        int top = Math.Max(clip.Top, Math.Max(0, contentTop));
        int bottom = Math.Min(clip.Bottom, Math.Min(viewportHeight, contentBottom));
        if (bottom <= top)
        {
            return;
        }

        int graphLeft = offsetX;
        int graphRight = offsetX + _messageColumnX;

        var previousSmoothing = g.SmoothingMode;
        g.SmoothingMode = SmoothingMode.None;

        using var lanePen = new Pen(LaneGridColor);
        using var rowPen = new Pen(RowSeparatorColor);
        using var textSepPen = new Pen(TextColumnSeparatorColor);

        for (int lane = 0; lane <= _maxLaneIndex + 1; lane++)
        {
            int x = offsetX + LeftMargin + lane * LaneWidth;
            if (x >= graphRight)
            {
                continue;
            }

            g.DrawLine(lanePen, x, top, x, bottom);
        }

        g.DrawLine(textSepPen, graphRight, top, graphRight, bottom);

        for (int i = 1; i < _columnHeaders.Length - 1; i++)
        {
            int x = offsetX + _columnHeaders[i].X + _columnHeaders[i].Width;
            g.DrawLine(lanePen, x, top, x, bottom);
        }

        for (int i = 0; i <= _rows.Count; i++)
        {
            int y = offsetY + i * RowHeight;
            if (y < clip.Top - 1 || y > clip.Bottom + 1)
            {
                continue;
            }

            g.DrawLine(rowPen, graphLeft, y, viewportWidth, y);
        }

        g.SmoothingMode = previousSmoothing;
    }

    private void HeaderPanel_MouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left)
        {
            return;
        }

        if (HitTestColumnDivider(e.X) is not int columnIndex)
        {
            return;
        }

        _resizeColumnIndex = columnIndex;
        _resizeStartMouseX = e.X - ScrollOffsetX;
        _resizeStartWidth = _columnWidths[columnIndex];
        _headerPanel!.Capture = true;
    }

    private void HeaderPanel_MouseMove(object? sender, MouseEventArgs e)
    {
        HandleMouseMove(e, _headerPanel!, isHeader: true);
    }

    private void BodyPanel_MouseMove(object? sender, MouseEventArgs e)
    {
        HandleMouseMove(e, _bodyPanel!, isHeader: false);
    }

    private void HandleMouseMove(MouseEventArgs e, Control source, bool isHeader)
    {
        if (_resizeColumnIndex >= 0)
        {
            HideHoverToolTip();
            int documentX = e.X - ScrollOffsetX;
            int delta = documentX - _resizeStartMouseX;
            int newWidth = Math.Max(GetMinColumnWidth(_resizeColumnIndex), _resizeStartWidth + delta);
            if (newWidth != _columnWidths[_resizeColumnIndex])
            {
                _columnWidths[_resizeColumnIndex] = newWidth;
                RecalculateColumnLayout(notifyLayoutChanged: false);
                InvalidateView();
            }

            return;
        }

        if (isHeader)
        {
            source.Cursor = HitTestColumnDivider(e.X) is not null ? Cursors.VSplit : Cursors.Default;
            UpdateToolTip(source, e.X, e.Y, GetHeaderToolTipAt(e.X));
            return;
        }

        if (source.Cursor == Cursors.VSplit)
        {
            source.Cursor = Cursors.Default;
        }

        UpdateToolTip(source, e.X, e.Y, GetBodyToolTipAt(e.X, e.Y));
    }

    private void HeaderPanel_MouseLeave(object? sender, EventArgs e)
    {
        HideHoverToolTip();
        if (_resizeColumnIndex < 0)
        {
            _headerPanel!.Cursor = Cursors.Default;
        }
    }

    private void BodyPanel_MouseLeave(object? sender, EventArgs e)
    {
        HideHoverToolTip();
    }

    private void HeaderPanel_MouseUp(object? sender, MouseEventArgs e)
    {
        EndColumnResize();
    }

    private void BodyPanel_MouseUp(object? sender, MouseEventArgs e)
    {
        EndColumnResize();
    }

    private void EndColumnResize()
    {
        if (_resizeColumnIndex < 0)
        {
            return;
        }

        _resizeColumnIndex = -1;
        if (_headerPanel is not null)
        {
            _headerPanel.Capture = false;
        }

        ColumnLayoutChanged?.Invoke(this, true);
    }

    private void BodyPanel_MouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Right)
        {
            return;
        }

        if (SelectRowAt(e.Y) is Commit commit)
        {
            CommitSelected?.Invoke(this, commit);
        }
    }

    private void BodyPanel_MouseClick(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left)
        {
            return;
        }

        if (SelectRowAt(e.Y) is Commit commit)
        {
            CommitSelected?.Invoke(this, commit);
        }
    }

    private Commit? SelectRowAt(int clientY)
    {
        int offsetY = ScrollOffsetY;
        int index = (clientY - offsetY) / RowHeight;
        if (index < 0 || index >= _rows.Count)
        {
            return null;
        }

        _selectedCommit = _rows[index].Commit;
        InvalidateView();
        return _selectedCommit;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _toolTip.Dispose();
        }

        base.Dispose(disposing);
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

    private void HideHoverToolTip()
    {
        _activeToolTip = null;
        _toolTip.Hide(this);
    }

    private void UpdateToolTip(Control source, int x, int y, string? tip)
    {
        if (tip == _activeToolTip)
        {
            return;
        }

        _activeToolTip = tip;
        if (tip is null)
        {
            _toolTip.Hide(this);
        }
        else
        {
            _toolTip.Show(tip, source, x + 14, y + 14, 10000);
        }
    }

    private string? GetBodyToolTipAt(int x, int y)
    {
        if (_rows.Count == 0)
        {
            return null;
        }

        const int dotHitRadius = DotRadius + 4;
        const float lineHitDistance = 5f;

        int offsetX = ScrollOffsetX;
        int offsetY = ScrollOffsetY;
        int LaneX(int lane) => offsetX + LeftMargin + lane * LaneWidth;

        string? lineTip = null;
        float closestLineDistance = float.MaxValue;

        for (int i = 0; i < _rows.Count; i++)
        {
            var row = _rows[i];
            int rowTop = offsetY + i * RowHeight;
            int rowMid = rowTop + RowHeight / 2;
            int rowBottom = rowTop + RowHeight;

            if (rowBottom < y - 10 || rowTop > y + 10)
            {
                continue;
            }

            int dotX = LaneX(row.Lane);
            if (IsNearPoint(x, y, dotX, rowMid, dotHitRadius))
            {
                return FormatCommitToolTip(row.Commit);
            }

            foreach (var lane in row.ForkLanes)
            {
                float distance = DistanceToSegment(x, y, dotX, rowMid, LaneX(lane), rowBottom);
                if (distance <= lineHitDistance && distance < closestLineDistance)
                {
                    closestLineDistance = distance;
                    lineTip = FormatMergeLineToolTip(row.Commit);
                }
            }

            float upperLineDistance = DistanceToVertical(x, y, dotX, rowTop, rowMid);
            if (upperLineDistance <= lineHitDistance && upperLineDistance < closestLineDistance)
            {
                closestLineDistance = upperLineDistance;
                lineTip = FormatLineToolTip(row.Commit, "Branch history line");
            }

            if (row.ContinuesDown)
            {
                float lowerLineDistance = DistanceToVertical(x, y, dotX, rowMid, rowBottom);
                if (lowerLineDistance <= lineHitDistance && lowerLineDistance < closestLineDistance)
                {
                    closestLineDistance = lowerLineDistance;
                    lineTip = FormatLineToolTip(row.Commit, "Continues to parent commit");
                }
            }

            foreach (var lane in row.PassThroughLanes)
            {
                float distance = DistanceToVertical(x, y, LaneX(lane), rowTop, rowBottom);
                if (distance <= lineHitDistance && distance < closestLineDistance)
                {
                    closestLineDistance = distance;
                    lineTip = "Parallel branch lane\nAnother branch history line on this row";
                }
            }
        }

        return lineTip;
    }

    private string? GetHeaderToolTipAt(int clientX)
    {
        int documentX = clientX - ScrollOffsetX;
        foreach (var header in _columnHeaders)
        {
            if (documentX >= header.X && documentX < header.X + header.Width)
            {
                return header.ToolTip;
            }
        }

        return null;
    }

    private static string FormatCommitToolTip(Commit commit) =>
        $"{commit.Sha[..7]}  {commit.MessageShort}\n{commit.Author.Name}  ·  {commit.Author.When:yyyy-MM-dd HH:mm}";

    private static string FormatLineToolTip(Commit commit, string lineKind) =>
        $"{lineKind}\n{commit.Sha[..7]}  {commit.MessageShort}";

    private static string FormatMergeLineToolTip(Commit commit)
    {
        int parentCount = commit.Parents.Count();
        string parentLabel = parentCount > 1 ? $"{parentCount} parents" : "1 parent";
        return $"Merge branch line ({parentLabel})\n{commit.Sha[..7]}  {commit.MessageShort}";
    }

    private static bool IsNearPoint(int px, int py, int cx, int cy, int radius)
    {
        int dx = px - cx;
        int dy = py - cy;
        return dx * dx + dy * dy <= radius * radius;
    }

    private static float DistanceToVertical(int px, int py, int x, int y1, int y2)
    {
        int top = Math.Min(y1, y2);
        int bottom = Math.Max(y1, y2);
        if (py < top || py > bottom)
        {
            return float.MaxValue;
        }

        return Math.Abs(px - x);
    }

    private static float DistanceToSegment(int px, int py, int x1, int y1, int x2, int y2)
    {
        float dx = x2 - x1;
        float dy = y2 - y1;
        if (dx == 0 && dy == 0)
        {
            float ddx = px - x1;
            float ddy = py - y1;
            return MathF.Sqrt(ddx * ddx + ddy * ddy);
        }

        float t = Math.Clamp(((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy), 0f, 1f);
        float projX = x1 + t * dx;
        float projY = y1 + t * dy;
        float distX = px - projX;
        float distY = py - projY;
        return MathF.Sqrt(distX * distX + distY * distY);
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

    private readonly record struct ColumnHeader(string Title, string ToolTip, int X, int Width);
}
