using System.Runtime.InteropServices;

namespace DiffMergeWinV10.App.Controls;

/// <summary>
/// Owner-draw list box that shows one diff line per row with stable full-width backgrounds
/// and keeps vertical scroll in sync with partner panes.
/// </summary>
public sealed class SyncLineListBox : ListBox, ILineScrollSource
{
    private const int WM_VSCROLL = 0x0115;
    private const int WM_MOUSEWHEEL = 0x020A;
    private const int WM_ERASEBKGND = 0x0014;
    private const int LB_SETHORIZONTALEXTENT = 0x0194;

    private bool _suppressSync;
    private bool _wordWrap;
    private int _fixedLineHeight = 18;
    private int _textPadding = 4;

    public List<SyncLineListBox> Partners { get; } = new();

    public event EventHandler? Scrolled;

    public event EventHandler? LinesChanged;

    event EventHandler? ILineScrollSource.ScrollPositionChanged
    {
        add => Scrolled += value;
        remove => Scrolled -= value;
    }

    Font ILineScrollSource.LineFont => Font;

    int ILineScrollSource.LineCount => GetViewportLineCount();

    int ILineScrollSource.ContentLineCount => _contentLineCount;

    private int _contentLineCount;

    public int ContentLineCount => _contentLineCount;

    public bool ShowSelectionAccent { get; set; }

    public SyncLineListBox()
    {
        IntegralHeight = false;
        SelectionMode = SelectionMode.One;
        BorderStyle = BorderStyle.None;
        DrawMode = DrawMode.OwnerDrawFixed;
        HorizontalScrollbar = true;
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);
        UpdateStyles();
    }

    public bool WordWrap
    {
        get => _wordWrap;
        set
        {
            if (_wordWrap == value)
            {
                return;
            }

            _wordWrap = value;
            DrawMode = value ? DrawMode.OwnerDrawVariable : DrawMode.OwnerDrawFixed;
            HorizontalScrollbar = !value;
            RefreshLineMetrics();
        }
    }

    public void ClearLines()
    {
        Items.Clear();
        _contentLineCount = 0;
        UpdateHorizontalExtent();
        LinesChanged?.Invoke(this, EventArgs.Empty);
    }

    public void AddLine(string text, Color backColor)
    {
        Items.Add(new PaneLineItem { Text = text, BackColor = backColor });
        _contentLineCount = Items.Count;
    }

    private bool _isEnsuringViewport;
    private System.Windows.Forms.Timer? _viewportFillTimer;

    public void EnsureViewportFill()
    {
        if (_isEnsuringViewport || !IsHandleCreated || ClientSize.Height <= 0)
        {
            return;
        }

        _isEnsuringViewport = true;
        BeginUpdate();
        try
        {
            while (Items.Count > _contentLineCount)
            {
                Items.RemoveAt(Items.Count - 1);
            }

            int lineHeight = Math.Max(1, ItemHeight);
            int visibleLines = ClientSize.Height / lineHeight;
            int targetCount = Math.Max(_contentLineCount, visibleLines);
            int lineIndex = _contentLineCount;
            while (Items.Count < targetCount)
            {
                Items.Add(new PaneLineItem
                {
                    Text = string.Empty,
                    BackColor = PaneTheme.ZebraForLine(lineIndex++),
                });
            }
        }
        finally
        {
            EndUpdate();
            _isEnsuringViewport = false;
        }

        Invalidate();
    }

    private void ScheduleViewportFill()
    {
        if (!IsHandleCreated || IsDisposed)
        {
            return;
        }

        _viewportFillTimer ??= new System.Windows.Forms.Timer { Interval = 50 };
        _viewportFillTimer.Tick -= OnViewportFillTimer;
        _viewportFillTimer.Tick += OnViewportFillTimer;
        _viewportFillTimer.Stop();
        _viewportFillTimer.Start();
    }

    private void OnViewportFillTimer(object? sender, EventArgs e)
    {
        _viewportFillTimer?.Stop();
        EnsureViewportFill();
    }

    public void FinishBatch()
    {
        RefreshLineMetrics();
        UpdateHorizontalExtent();
        EnsureViewportFill();
        LinesChanged?.Invoke(this, EventArgs.Empty);
    }

    public void ScrollToTop()
    {
        if (Items.Count == 0)
        {
            return;
        }

        TopIndex = 0;
    }

    public int GetFirstVisibleLine() => TopIndex;

    int ILineScrollSource.GetFirstVisibleLine() => GetFirstVisibleLine();

    public int GetLineTop(int lineIndex)
    {
        if (!IsHandleCreated)
        {
            return -1;
        }

        int first = TopIndex;
        if (lineIndex < first)
        {
            return -1;
        }

        if (!_wordWrap)
        {
            int lineHeight = Math.Max(1, ItemHeight);
            int top = (lineIndex - first) * lineHeight;
            return top >= ClientSize.Height ? -1 : top;
        }

        int wrappedY = 0;
        for (int line = first; line < lineIndex; line++)
        {
            wrappedY += GetLineHeight(line);
            if (wrappedY > ClientSize.Height)
            {
                return -1;
            }
        }

        return wrappedY;
    }

    public int GetLineHeight(int lineIndex)
    {
        if (lineIndex < 0 || lineIndex >= Items.Count)
        {
            return _fixedLineHeight;
        }

        if (!_wordWrap)
        {
            return ItemHeight;
        }

        using var graphics = CreateGraphics();
        return MeasureWrappedHeight(graphics, lineIndex);
    }

    int ILineScrollSource.GetLineHeight(int lineIndex) => GetLineHeight(lineIndex);

    int ILineScrollSource.GetLineTop(int lineIndex) => GetLineTop(lineIndex);

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        ScheduleViewportFill();
    }

    protected override void OnFontChanged(EventArgs e)
    {
        base.OnFontChanged(e);
        RefreshLineMetrics();
        ScheduleViewportFill();
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        if (_wordWrap && IsHandleCreated)
        {
            RefreshLineMetrics();
        }

        TrimOverflowItems();
        ScheduleViewportFill();
    }

    // Immediately removes fill items that exceed the new (smaller) viewport so the
    // vertical scrollbar doesn't flash before the deferred EnsureViewportFill runs.
    private void TrimOverflowItems()
    {
        if (!IsHandleCreated || ClientSize.Height <= 0 || Items.Count <= _contentLineCount)
        {
            return;
        }

        int lineHeight = Math.Max(1, ItemHeight);
        int maxItems = Math.Max(_contentLineCount, ClientSize.Height / lineHeight);
        if (Items.Count <= maxItems)
        {
            return;
        }

        BeginUpdate();
        while (Items.Count > maxItems)
        {
            Items.RemoveAt(Items.Count - 1);
        }

        EndUpdate();
    }

    protected override void OnPaintBackground(PaintEventArgs pevent)
    {
        PaintFullViewportBackground(pevent.Graphics, ClientRectangle);
    }

    private int GetViewportLineCount()
    {
        if (!IsHandleCreated || ClientSize.Height <= 0)
        {
            return Math.Max(Items.Count, 1);
        }

        int lineHeight = Math.Max(1, ItemHeight);
        int visibleLines = (int)Math.Ceiling(ClientSize.Height / (double)lineHeight);
        return Math.Max(Items.Count, TopIndex + visibleLines);
    }

    private Color GetBackgroundColorForLine(int lineIndex)
    {
        if (lineIndex >= 0 && lineIndex < Items.Count && Items[lineIndex] is PaneLineItem item)
        {
            return item.BackColor;
        }

        return PaneTheme.ZebraForLine(lineIndex);
    }

    private void PaintFullViewportBackground(Graphics graphics, Rectangle bounds)
    {
        if (bounds.Width <= 0 || bounds.Height <= 0)
        {
            return;
        }

        int lineHeight = Math.Max(1, ItemHeight);
        int firstLine = TopIndex;
        int y = 0;
        for (int line = firstLine; y < bounds.Height; line++)
        {
            Color color = GetBackgroundColorForLine(line);
            int stripeHeight = Math.Min(lineHeight, bounds.Height - y);
            using var brush = new SolidBrush(color);
            graphics.FillRectangle(brush, bounds.X, y, bounds.Width, stripeHeight);
            y += lineHeight;
        }
    }

    protected override void OnMeasureItem(MeasureItemEventArgs e)
    {
        if (e.Index < 0 || e.Index >= Items.Count)
        {
            e.ItemHeight = _fixedLineHeight;
            return;
        }

        e.ItemHeight = MeasureWrappedHeight(e.Graphics, e.Index);
    }

    protected override void OnDrawItem(DrawItemEventArgs e)
    {
        if (e.Index < 0 || e.Index >= Items.Count)
        {
            e.DrawBackground();
            return;
        }

        var item = (PaneLineItem)Items[e.Index];
        using (var rowBrush = new SolidBrush(item.BackColor))
        {
            e.Graphics.FillRectangle(rowBrush, e.Bounds);
        }

        bool selected = (e.State & DrawItemState.Selected) == DrawItemState.Selected;
        int textLeft = e.Bounds.X + _textPadding;
        if (selected && ShowSelectionAccent && e.Index < _contentLineCount)
        {
            using var accentBrush = new SolidBrush(PaneTheme.SelectedConflictColor);
            e.Graphics.FillRectangle(accentBrush, e.Bounds.X, e.Bounds.Y, 4, e.Bounds.Height);
            textLeft += 4;
        }

        var textBounds = new Rectangle(
            textLeft,
            e.Bounds.Y,
            Math.Max(0, e.Bounds.Right - textLeft - _textPadding),
            e.Bounds.Height);

        var flags = TextFormatFlags.NoPrefix | TextFormatFlags.Left | TextFormatFlags.VerticalCenter;
        flags |= _wordWrap ? TextFormatFlags.WordBreak : TextFormatFlags.SingleLine;
        TextRenderer.DrawText(e.Graphics, item.Text, Font, textBounds, ForeColor, flags);
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WM_ERASEBKGND)
        {
            using var graphics = Graphics.FromHdc(m.WParam);
            PaintFullViewportBackground(graphics, ClientRectangle);
            m.Result = (IntPtr)1;
            return;
        }

        base.WndProc(ref m);

        if (!_suppressSync && (m.Msg == WM_VSCROLL || m.Msg == WM_MOUSEWHEEL))
        {
            Scrolled?.Invoke(this, EventArgs.Empty);
            SyncPartners();
        }
    }

    public void SyncPartners()
    {
        int myTop = TopIndex;
        foreach (var partner in Partners)
        {
            if (!partner.IsHandleCreated || partner.TopIndex == myTop)
            {
                continue;
            }

            partner._suppressSync = true;
            partner.TopIndex = Math.Min(myTop, Math.Max(0, partner.Items.Count - 1));
            partner._suppressSync = false;
            partner.Scrolled?.Invoke(partner, EventArgs.Empty);
        }
    }

    public void CopySelectedLine()
    {
        if (SelectedIndex < 0 || SelectedIndex >= Items.Count)
        {
            return;
        }

        if (Items[SelectedIndex] is PaneLineItem item)
        {
            Clipboard.SetText(item.Text);
        }
    }

    private void RefreshLineMetrics()
    {
        _fixedLineHeight = Math.Max(1, TextRenderer.MeasureText("Ag", Font).Height + _textPadding);
        ItemHeight = _fixedLineHeight;
        if (_wordWrap && IsHandleCreated)
        {
            Invalidate();
        }
        else
        {
            UpdateHorizontalExtent();
            Invalidate();
        }
    }

    private int MeasureWrappedHeight(Graphics graphics, int index)
    {
        if (index < 0 || index >= Items.Count)
        {
            return _fixedLineHeight;
        }

        var item = (PaneLineItem)Items[index];
        if (!_wordWrap)
        {
            return _fixedLineHeight;
        }

        int width = Math.Max(8, ClientSize.Width - _textPadding * 2);
        var size = TextRenderer.MeasureText(
            graphics,
            string.IsNullOrEmpty(item.Text) ? " " : item.Text,
            Font,
            new Size(width, int.MaxValue),
            TextFormatFlags.WordBreak | TextFormatFlags.NoPrefix);

        return Math.Max(_fixedLineHeight, size.Height + _textPadding);
    }

    private void UpdateHorizontalExtent()
    {
        if (_wordWrap || !IsHandleCreated || Items.Count == 0)
        {
            return;
        }

        int maxWidth = ClientSize.Width;
        using var graphics = CreateGraphics();
        foreach (PaneLineItem item in Items)
        {
            int width = TextRenderer.MeasureText(
                graphics,
                string.IsNullOrEmpty(item.Text) ? " " : item.Text,
                Font,
                new Size(int.MaxValue, int.MaxValue),
                TextFormatFlags.NoPadding | TextFormatFlags.SingleLine).Width;
            maxWidth = Math.Max(maxWidth, width + _textPadding * 2);
        }

        SendMessage(Handle, LB_SETHORIZONTALEXTENT, maxWidth, 0);
    }

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern int SendMessage(IntPtr hWnd, int msg, int wParam, int lParam);
}
