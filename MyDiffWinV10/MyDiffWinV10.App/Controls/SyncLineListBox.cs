using System.Runtime.InteropServices;
using MyDiffWinV10.App.Core;

namespace MyDiffWinV10.App.Controls;

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
    private const int SB_VERT = 1;

    private bool _suppressSync;
    private bool _wordWrap;
    private int _fixedLineHeight = 18;
    private int _textPadding = 4;
    private int _monoCharWidth = -1;
    private bool _hasBinaryHexLines;
    private bool _virtualBinaryMode;
    private BinaryDiffDocument? _binaryDocument;
    private bool _binaryIsLeft;
    private int _binaryScrollTop;

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

    /// <summary>
    /// Hides the listbox's own (narrow, fixed-width) native vertical scrollbar so a wider
    /// <see cref="PaneVScrollBar"/> can be docked next to it instead — Windows doesn't expose
    /// a way to widen a ListBox's built-in scrollbar directly.
    /// </summary>
    public bool HideNativeVerticalScrollbar { get; set; }

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

    private void ApplyNativeVerticalScrollbarVisibility()
    {
        if (HideNativeVerticalScrollbar && IsHandleCreated)
        {
            ShowScrollBar(Handle, SB_VERT, false);
        }
    }

    [DllImport("user32.dll")]
    private static extern bool ShowScrollBar(IntPtr hWnd, int wBar, bool bShow);

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
        DisableVirtualBinaryMode();
        Items.Clear();
        _contentLineCount = 0;
        _hasBinaryHexLines = false;
        UpdateHorizontalExtent();
        LinesChanged?.Invoke(this, EventArgs.Empty);
    }

    public void SetVirtualBinaryContent(BinaryDiffDocument document, bool isLeft)
    {
        DisableVirtualBinaryMode();
        Items.Clear();

        _binaryDocument = document;
        _binaryIsLeft = isLeft;
        _virtualBinaryMode = true;
        _hasBinaryHexLines = true;
        _contentLineCount = document.LineCount;
        _binaryScrollTop = 0;

        RefreshBinaryWindow();
        RefreshLineMetrics();
        UpdateHorizontalExtent();
        LinesChanged?.Invoke(this, EventArgs.Empty);
    }

    public void SetBinaryScrollTop(int line, bool syncPartners = true)
    {
        if (!_virtualBinaryMode)
        {
            TopIndex = Math.Clamp(line, 0, Math.Max(0, Items.Count - 1));
            Scrolled?.Invoke(this, EventArgs.Empty);
            if (syncPartners)
            {
                SyncPartners();
            }

            return;
        }

        int clamped = Math.Clamp(line, 0, Math.Max(0, _contentLineCount - 1));
        if (clamped == _binaryScrollTop && Items.Count > 0)
        {
            return;
        }

        _binaryScrollTop = clamped;
        RefreshBinaryWindow();
        Scrolled?.Invoke(this, EventArgs.Empty);
        if (syncPartners)
        {
            SyncPartners();
        }
    }

    private void DisableVirtualBinaryMode()
    {
        if (!_virtualBinaryMode)
        {
            return;
        }

        _virtualBinaryMode = false;
        _binaryDocument = null;
        _binaryScrollTop = 0;
    }

    private void RefreshBinaryWindow()
    {
        if (!_virtualBinaryMode || _binaryDocument == null || !IsHandleCreated)
        {
            return;
        }

        int lineHeight = Math.Max(1, ItemHeight);
        int visibleLines = ClientSize.Height > 0
            ? (int)Math.Ceiling(ClientSize.Height / (double)lineHeight) + 2
            : 32;
        int end = Math.Min(_contentLineCount, _binaryScrollTop + visibleLines);

        BeginUpdate();
        try
        {
            Items.Clear();
            for (int line = _binaryScrollTop; line < end; line++)
            {
                Items.Add(CreateBinaryPaneLine(line));
            }

            TopIndex = 0;
        }
        finally
        {
            EndUpdate();
        }

        Invalidate();
    }

    private PaneLineItem CreateBinaryPaneLine(int lineIndex)
    {
        var line = _binaryIsLeft
            ? _binaryDocument!.GetLeftLine(lineIndex)
            : _binaryDocument!.GetRightLine(lineIndex);
        return new PaneLineItem
        {
            Text = line.Text,
            BackColor = PaneTheme.RowBackColor(_binaryDocument!.RowKinds[lineIndex], lineIndex),
            BinaryByteDiffMask = line.DiffMask,
        };
    }

    public void AddLine(string text, Color backColor)
    {
        AddLine(new PaneLineItem { Text = text, BackColor = backColor });
    }

    public void AddLine(PaneLineItem item)
    {
        if (item.BinaryByteDiffMask.HasValue)
        {
            _hasBinaryHexLines = true;
        }

        Items.Add(item);
        _contentLineCount = Items.Count;
    }

    private bool _isEnsuringViewport;
    private System.Windows.Forms.Timer? _viewportFillTimer;

    public void EnsureViewportFill()
    {
        if (_virtualBinaryMode || _isEnsuringViewport || !IsHandleCreated || ClientSize.Height <= 0)
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
            int visibleLines = (int)Math.Ceiling(ClientSize.Height / (double)lineHeight);
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

        ApplyNativeVerticalScrollbarVisibility();
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
        if (_contentLineCount == 0)
        {
            return;
        }

        if (_virtualBinaryMode)
        {
            SetBinaryScrollTop(0, syncPartners: false);
            return;
        }

        TopIndex = 0;
    }

    public int GetFirstVisibleLine() => _virtualBinaryMode ? _binaryScrollTop : TopIndex;

    int ILineScrollSource.GetFirstVisibleLine() => GetFirstVisibleLine();

    public int GetLineTop(int lineIndex)
    {
        if (!IsHandleCreated)
        {
            return -1;
        }

        int first = GetFirstVisibleLine();
        if (lineIndex < first)
        {
            return -1;
        }

        if (!_wordWrap)
        {
            int lineHeight = Math.Max(1, ItemHeight);
            int relative = lineIndex - first;
            if (_virtualBinaryMode && relative >= Items.Count)
            {
                return -1;
            }

            int top = relative * lineHeight;
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
        if (lineIndex < 0 || lineIndex >= _contentLineCount)
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
        ApplyNativeVerticalScrollbarVisibility();
        if (_virtualBinaryMode)
        {
            RefreshBinaryWindow();
        }
        else
        {
            ScheduleViewportFill();
        }
    }

    protected override void OnFontChanged(EventArgs e)
    {
        base.OnFontChanged(e);
        RefreshLineMetrics();
        if (_virtualBinaryMode)
        {
            RefreshBinaryWindow();
        }
        else
        {
            ScheduleViewportFill();
        }
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        if (_wordWrap && IsHandleCreated)
        {
            RefreshLineMetrics();
        }

        ApplyNativeVerticalScrollbarVisibility();
        if (_virtualBinaryMode)
        {
            RefreshBinaryWindow();
        }
        else
        {
            ScheduleViewportFill();
        }
    }

    protected override void OnPaintBackground(PaintEventArgs pevent)
    {
        PaintFullViewportBackground(pevent.Graphics, ClientRectangle);
    }

    private int GetViewportLineCount()
    {
        if (!IsHandleCreated || ClientSize.Height <= 0)
        {
            return Math.Max(_contentLineCount, 1);
        }

        int lineHeight = Math.Max(1, ItemHeight);
        int visibleLines = (int)Math.Ceiling(ClientSize.Height / (double)lineHeight);
        return Math.Max(_contentLineCount, TopIndex + visibleLines);
    }

    private Color GetBackgroundColorForLine(int lineIndex)
    {
        if (_virtualBinaryMode && _binaryDocument != null && lineIndex >= 0 && lineIndex < _binaryDocument.LineCount)
        {
            return PaneTheme.RowBackColor(_binaryDocument.RowKinds[lineIndex], lineIndex);
        }

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
        int firstLine = GetFirstVisibleLine();
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
        if (e.Index < 0 || e.Index >= _contentLineCount)
        {
            e.ItemHeight = _fixedLineHeight;
            return;
        }

        e.ItemHeight = MeasureWrappedHeight(e.Graphics, e.Index);
    }

    protected override void OnDrawItem(DrawItemEventArgs e)
    {
        if (e.Index < 0 || e.Index >= _contentLineCount)
        {
            e.DrawBackground();
            return;
        }

        var item = (PaneLineItem)Items[e.Index]!;
        using (var rowBrush = new SolidBrush(item.BackColor))
        {
            e.Graphics.FillRectangle(rowBrush, e.Bounds);
        }

        bool selected = (e.State & DrawItemState.Selected) == DrawItemState.Selected;
        int logicalIndex = _virtualBinaryMode ? _binaryScrollTop + e.Index : e.Index;
        int textLeft = e.Bounds.X + _textPadding;
        if (selected && ShowSelectionAccent && logicalIndex < _contentLineCount)
        {
            using var accentBrush = new SolidBrush(PaneTheme.SelectedAccentColor);
            e.Graphics.FillRectangle(accentBrush, e.Bounds.X, e.Bounds.Y, 4, e.Bounds.Height);
            textLeft += 4;
        }

        var textBounds = new Rectangle(
            textLeft,
            e.Bounds.Y,
            Math.Max(0, e.Bounds.Right - textLeft - _textPadding),
            e.Bounds.Height);

        if (item.BinaryByteDiffMask is ushort diffMask)
        {
            DrawBinaryHexLine(e.Graphics, textBounds, item.Text, diffMask);
            return;
        }

        var flags = TextFormatFlags.NoPrefix | TextFormatFlags.Left | TextFormatFlags.VerticalCenter;
        flags |= _wordWrap ? TextFormatFlags.WordBreak : TextFormatFlags.SingleLine;
        TextRenderer.DrawText(e.Graphics, item.Text, Font, textBounds, ForeColor, flags);
    }

    private void DrawBinaryHexLine(Graphics graphics, Rectangle bounds, string text, ushort diffMask)
    {
        EnsureMonoCharWidth(graphics);
        var baseFlags = TextFormatFlags.NoPrefix | TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding | TextFormatFlags.SingleLine;

        TextRenderer.DrawText(graphics, text, Font, bounds, ForeColor, baseFlags);

        if (diffMask == 0)
        {
            return;
        }

        int y = bounds.Y;
        int height = bounds.Height;
        var diffColor = PaneTheme.BinaryDiffTextColor;

        for (int byteIndex = 0; byteIndex < 16; byteIndex++)
        {
            if ((diffMask & (1 << byteIndex)) == 0)
            {
                continue;
            }

            int hexStart = BinaryHexLayout.HexStart(byteIndex);
            var hexBounds = new Rectangle(
                bounds.X + hexStart * _monoCharWidth,
                y,
                _monoCharWidth * 2,
                height);
            TextRenderer.DrawText(
                graphics,
                text.AsSpan(hexStart, 2),
                Font,
                hexBounds,
                diffColor,
                baseFlags);

            int asciiIndex = BinaryHexLayout.AsciiIndex(byteIndex);
            var asciiBounds = new Rectangle(
                bounds.X + asciiIndex * _monoCharWidth,
                y,
                _monoCharWidth,
                height);
            TextRenderer.DrawText(
                graphics,
                text.AsSpan(asciiIndex, 1),
                Font,
                asciiBounds,
                diffColor,
                baseFlags);
        }
    }

    private void EnsureMonoCharWidth(Graphics? graphics = null)
    {
        if (_monoCharWidth > 0)
        {
            return;
        }

        bool owned = graphics == null;
        graphics ??= CreateGraphics();
        try
        {
            _monoCharWidth = Math.Max(
                1,
                TextRenderer.MeasureText(
                    graphics,
                    "0",
                    Font,
                    new Size(int.MaxValue, _fixedLineHeight),
                    TextFormatFlags.NoPadding | TextFormatFlags.SingleLine).Width);
        }
        finally
        {
            if (owned)
            {
                graphics.Dispose();
            }
        }
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

        if (!_suppressSync && m.Msg == WM_MOUSEWHEEL)
        {
            ScrollByWheelDelta((short)((long)m.WParam >> 16));
            m.Result = (IntPtr)1;
            return;
        }

        base.WndProc(ref m);

        if (!_suppressSync && m.Msg == WM_VSCROLL)
        {
            Scrolled?.Invoke(this, EventArgs.Empty);
            SyncPartners();
        }
    }

    private void ScrollByWheelDelta(int delta)
    {
        int step = GetWheelScrollLines(delta);
        if (step == 0)
        {
            return;
        }

        if (_virtualBinaryMode)
        {
            SetBinaryScrollTop(_binaryScrollTop + step, syncPartners: true);
            return;
        }

        int newTop = Math.Clamp(TopIndex + step, 0, Math.Max(0, _contentLineCount - 1));
        if (newTop == TopIndex)
        {
            return;
        }

        TopIndex = newTop;
        Scrolled?.Invoke(this, EventArgs.Empty);
        SyncPartners();
    }

    private int GetWheelScrollLines(int delta)
    {
        if (delta == 0)
        {
            return 0;
        }

        int lines = SystemInformation.MouseWheelScrollLines;
        if (lines < 0)
        {
            lines = Math.Max(1, ClientSize.Height / Math.Max(1, ItemHeight));
        }

        return delta > 0 ? -lines : lines;
    }

    public void SyncPartners()
    {
        int myTop = GetFirstVisibleLine();
        foreach (var partner in Partners)
        {
            if (!partner.IsHandleCreated || partner.GetFirstVisibleLine() == myTop)
            {
                continue;
            }

            partner._suppressSync = true;
            partner.SetBinaryScrollTop(myTop, syncPartners: false);
            partner._suppressSync = false;
            partner.Scrolled?.Invoke(partner, EventArgs.Empty);
        }
    }

    public void CopySelectedLine()
    {
        if (SelectedIndex < 0)
        {
            return;
        }

        int lineIndex = _virtualBinaryMode ? _binaryScrollTop + SelectedIndex : SelectedIndex;
        if (lineIndex < 0 || lineIndex >= _contentLineCount)
        {
            return;
        }

        if (_virtualBinaryMode)
        {
            var line = _binaryIsLeft
                ? _binaryDocument!.GetLeftLine(lineIndex)
                : _binaryDocument!.GetRightLine(lineIndex);
            Clipboard.SetText(line.Text);
            return;
        }

        Clipboard.SetText(((PaneLineItem)Items[SelectedIndex]!).Text);
    }

    private void RefreshLineMetrics()
    {
        _monoCharWidth = -1;
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
        if (_wordWrap || !IsHandleCreated || _contentLineCount == 0)
        {
            return;
        }

        if (_hasBinaryHexLines)
        {
            EnsureMonoCharWidth();
            int width = BinaryHexLayout.LineLength * _monoCharWidth + _textPadding * 2;
            SendMessage(Handle, LB_SETHORIZONTALEXTENT, Math.Max(ClientSize.Width, width), 0);
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
