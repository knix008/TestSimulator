using System.Runtime.CompilerServices;
using ReqTrace.Resources;

namespace ReqTrace.Theme;

/// <summary>
/// Lightweight flat/modern visual theme applied across all forms: neutral light palette,
/// a single accent color, borderless flat controls, and a custom ToolStrip renderer for
/// the menu/toolbar/status bar. Call <see cref="InitializeApplication"/> once at startup
/// and <see cref="Apply"/> on every form after its controls are constructed.
/// </summary>
public static class ModernTheme
{
    private static readonly HashSet<ListView> AdjustingListViewColumnWidth = [];
    private static readonly ConditionalWeakTable<ListView, ListViewLayoutTracker> ListViewLayoutTrackers = new();
    private const int ListViewCellPadding = 4;
    private const int ListViewLayoutRefreshDelayMs = 40;
    public static readonly Color Background = Color.FromArgb(243, 244, 246);
    public static readonly Color Surface = Color.White;
    public static readonly Color Accent = Color.FromArgb(37, 99, 235);
    public static readonly Color Border = Color.FromArgb(223, 225, 230);
    public static readonly Color PanelSideBorder = Color.FromArgb(156, 163, 175);
    public static readonly Color TextPrimary = Color.FromArgb(17, 24, 39);

    public static readonly Color PastelBlue = Color.FromArgb(219, 234, 254);
    public static readonly Color PastelGreen = Color.FromArgb(220, 252, 231);
    public static readonly Color PastelRose = Color.FromArgb(254, 226, 226);
    public static readonly Color PastelLavender = Color.FromArgb(233, 213, 255);
    public static readonly Color PanelHeaderText = Color.FromArgb(51, 65, 85);
    public static readonly Color ListHeaderBack = Color.FromArgb(243, 244, 246);
    public static readonly Color ListHeaderFore = Color.FromArgb(107, 114, 128);
    public static readonly Color SelectionBack = PastelLavender;
    public static readonly Color SelectionFore = Color.FromArgb(30, 41, 59);
    public static readonly Color AccentSoft = PastelLavender;

    // Segoe UI has no Hangul glyphs, so Korean text falls back to a different font
    // (e.g. Malgun Gothic) at render time. GDI's per-glyph fallback uses that font's
    // own metrics, which don't match the line box TextRenderer reserved for Segoe UI,
    // clipping the tops/bottoms (batchim) of Hangul characters. Malgun Gothic covers
    // both Hangul and Latin natively, so there's no cross-font fallback to clip against.
    public static readonly Font BaseFont = new("Malgun Gothic", 9.5f, FontStyle.Regular);
    public static readonly Font BoldFont = new("Malgun Gothic", 9.5f, FontStyle.Bold);

    public static void InitializeApplication()
    {
        ToolStripManager.Renderer = new ModernToolStripRenderer();
    }

    public static void Apply(Form form)
    {
        form.Font = BaseFont;
        form.BackColor = Background;
        form.Icon = AppAssets.AppIcon;
        StyleControls(form.Controls);
    }

    private static void StyleControls(Control.ControlCollection controls)
    {
        foreach (Control control in controls)
        {
            StyleControl(control);
            if (control.Controls.Count > 0 && control is not DataGridView)
                StyleControls(control.Controls);
        }
    }

    private static void StyleControl(Control control)
    {
        control.Font = BaseFont;

        switch (control)
        {
            case Button button:
                button.FlatStyle = FlatStyle.Flat;
                button.FlatAppearance.BorderSize = 1;
                button.FlatAppearance.BorderColor = Border;
                button.FlatAppearance.MouseOverBackColor = AccentSoft;
                button.BackColor = Surface;
                button.ForeColor = TextPrimary;
                button.Cursor = Cursors.Hand;
                if (button.Height < 28)
                    button.Height = 28;
                break;

            case TextBox textBox:
                textBox.BorderStyle = BorderStyle.FixedSingle;
                textBox.BackColor = Surface;
                textBox.ForeColor = TextPrimary;
                break;

            case ComboBox comboBox:
                comboBox.FlatStyle = FlatStyle.Standard;
                comboBox.BackColor = Surface;
                comboBox.ForeColor = TextPrimary;
                break;

            case NumericUpDown numeric:
                numeric.BorderStyle = BorderStyle.FixedSingle;
                break;

            case ListBox listBox:
                listBox.BorderStyle = BorderStyle.FixedSingle;
                listBox.BackColor = Surface;
                break;

            case TreeView treeView:
                treeView.BorderStyle = BorderStyle.None;
                treeView.BackColor = Surface;
                treeView.ForeColor = TextPrimary;
                treeView.ItemHeight = 24;
                break;

            case ListView listView:
                listView.BorderStyle = BorderStyle.None;
                listView.BackColor = Surface;
                listView.ForeColor = TextPrimary;
                ApplyListViewPastelStyle(listView);
                break;

            case DataGridView grid:
                StyleGrid(grid);
                break;

            case MenuStrip menu:
                menu.BackColor = Surface;
                menu.Renderer = new ModernToolStripRenderer();
                break;

            case StatusStrip statusStrip:
                statusStrip.BackColor = Background;
                statusStrip.Renderer = new ModernToolStripRenderer();
                break;

            case ToolStrip toolStrip:
                toolStrip.BackColor = Surface;
                toolStrip.Renderer = new ModernToolStripRenderer();
                break;

            case SplitContainer split:
                split.BackColor = Border;
                split.Panel1.BackColor = Surface;
                split.Panel2.BackColor = Surface;
                split.SplitterWidth = 4;
                break;

            case Panel panel:
                panel.BackColor = Surface;
                break;

            case Label label:
                label.ForeColor = TextPrimary;
                break;
        }
    }

    private static void StyleGrid(DataGridView grid)
    {
        grid.BorderStyle = BorderStyle.None;
        grid.BackgroundColor = Surface;
        grid.GridColor = Border;
        grid.EnableHeadersVisualStyles = false;
        grid.ColumnHeadersVisible = true;
        grid.ColumnHeadersDefaultCellStyle.BackColor = ListHeaderBack;
        grid.ColumnHeadersDefaultCellStyle.ForeColor = ListHeaderFore;
        grid.ColumnHeadersDefaultCellStyle.Font = BoldFont;
        grid.ColumnHeadersDefaultCellStyle.SelectionBackColor = ListHeaderBack;
        grid.ColumnHeadersDefaultCellStyle.SelectionForeColor = ListHeaderFore;
        grid.ColumnHeadersHeight = 32;
        grid.ColumnHeadersBorderStyle = DataGridViewHeaderBorderStyle.None;
        grid.DefaultCellStyle.BackColor = Surface;
        grid.DefaultCellStyle.ForeColor = TextPrimary;
        grid.DefaultCellStyle.SelectionBackColor = SelectionBack;
        grid.DefaultCellStyle.SelectionForeColor = SelectionFore;
        grid.RowTemplate.Height = 28;
        grid.CellBorderStyle = DataGridViewCellBorderStyle.SingleHorizontal;
        grid.RowHeadersVisible = false;
    }

    public static void MakePrimary(Button button)
    {
        button.BackColor = Accent;
        button.ForeColor = Color.White;
        button.FlatAppearance.BorderColor = Accent;
        button.FlatAppearance.MouseOverBackColor = Color.FromArgb(29, 78, 216);
        button.FlatAppearance.MouseDownBackColor = Color.FromArgb(23, 64, 178);
    }

    /// <summary>
    /// Draws visible borders in the padding gutters around a panel's content area.
    /// </summary>
    public static void ApplyPanelBorder(Control panel)
    {
        panel.Paint -= OnPanelBorderPaint;
        panel.Paint += OnPanelBorderPaint;
    }

    public static void ApplyListViewPastelStyle(ListView listView)
    {
        listView.HeaderStyle = ColumnHeaderStyle.Clickable;
        listView.OwnerDraw = true;
        listView.HoverSelection = false;
        EnableListViewSmoothPainting(listView);
        listView.DrawColumnHeader -= OnListViewDrawColumnHeader;
        listView.DrawColumnHeader += OnListViewDrawColumnHeader;
        listView.DrawItem -= OnListViewDrawItem;
        listView.DrawItem += OnListViewDrawItem;
        listView.DrawSubItem -= OnListViewDrawSubItem;
        listView.DrawSubItem += OnListViewDrawSubItem;
        listView.Resize -= OnListViewResizeFillLastColumn;
        listView.Resize += OnListViewResizeFillLastColumn;
        listView.ColumnWidthChanging -= OnListViewColumnWidthChanging;
        listView.ColumnWidthChanging += OnListViewColumnWidthChanging;
        listView.ColumnWidthChanged -= OnListViewColumnWidthChangedFillLastColumn;
        listView.ColumnWidthChanged += OnListViewColumnWidthChangedFillLastColumn;
        listView.MouseDown -= OnListViewMouseDownColumnResize;
        listView.MouseDown += OnListViewMouseDownColumnResize;
        listView.MouseUp -= OnListViewMouseUpColumnResize;
        listView.MouseUp += OnListViewMouseUpColumnResize;
        listView.Disposed -= OnListViewDisposed;
        listView.Disposed += OnListViewDisposed;
        listView.SelectedIndexChanged -= OnListViewSelectedIndexChanged;
        listView.SelectedIndexChanged += OnListViewSelectedIndexChanged;
        FillLastListViewColumn(listView);
    }

    private static void OnListViewSelectedIndexChanged(object? sender, EventArgs e)
    {
        if (sender is not ListView listView)
            return;

        var tracker = GetLayoutTracker(listView);
        if (tracker.IsResizingColumns)
            return;

        listView.Invalidate();
    }

    private static void OnListViewMouseDownColumnResize(object? sender, MouseEventArgs e)
    {
        if (sender is not ListView listView)
            return;

        if (listView.HitTest(e.Location).Location != ListViewHitTestLocations.AboveClientArea)
            return;

        GetLayoutTracker(listView).IsResizingColumns = true;
    }

    private static void OnListViewMouseUpColumnResize(object? sender, MouseEventArgs e)
    {
        if (sender is not ListView listView)
            return;

        var tracker = GetLayoutTracker(listView);
        if (!tracker.IsResizingColumns)
            return;

        CompleteListViewLayoutRefresh(listView);
    }

    private static ListViewLayoutTracker GetLayoutTracker(ListView listView) =>
        ListViewLayoutTrackers.GetOrCreateValue(listView);

    private static void OnListViewDisposed(object? sender, EventArgs e)
    {
        if (sender is not ListView listView)
            return;

        if (!ListViewLayoutTrackers.TryGetValue(listView, out var tracker))
            return;

        tracker.StopLayoutTimer();
    }

    private static void EnableListViewSmoothPainting(ListView listView)
    {
        typeof(Control).InvokeMember(
            "DoubleBuffered",
            System.Reflection.BindingFlags.NonPublic
                | System.Reflection.BindingFlags.Instance
                | System.Reflection.BindingFlags.SetProperty,
            null,
            listView,
            [true]);
    }

    private static void OnListViewResizeFillLastColumn(object? sender, EventArgs e)
    {
        if (sender is ListView listView)
            ScheduleListViewLayoutRefresh(listView);
    }

    private static void OnListViewColumnWidthChanging(object? sender, ColumnWidthChangingEventArgs e)
    {
        if (sender is not ListView listView || AdjustingListViewColumnWidth.Contains(listView))
            return;

        GetLayoutTracker(listView).IsResizingColumns = true;

        // The header drag only auto-invalidates the column being resized, but a
        // width change shifts every column to its right. Mark the whole control
        // dirty so the next paint repaints those too (GetColumnBounds always
        // recomputes from the live Columns widths, so this paint will already see
        // the new width by the time it runs - no need to force it synchronously,
        // which would stall the UI thread on every pixel of drag movement).
        listView.Invalidate();
    }

    private static void OnListViewColumnWidthChangedFillLastColumn(object? sender, ColumnWidthChangedEventArgs e)
    {
        if (sender is not ListView listView || AdjustingListViewColumnWidth.Contains(listView))
            return;

        var tracker = GetLayoutTracker(listView);
        tracker.IsResizingColumns = true;
        FillLastListViewColumn(listView);

        // This handler fires on every pixel of drag movement (HDN_ITEMCHANGED is as
        // chatty as HDN_ITEMCHANGING). Refresh() forces an immediate synchronous
        // repaint, which - multiplied by every pixel of mouse movement - stalls the
        // UI thread badly on lists with many rows. Invalidate() just marks the
        // region dirty and lets the normal paint cycle catch up; the debounced
        // CompleteListViewLayoutRefresh below still does one final Refresh() once
        // the drag settles.
        listView.Invalidate();
        ScheduleListViewLayoutRefresh(listView);
    }

    private static void ScheduleListViewLayoutRefresh(ListView listView)
    {
        if (!listView.IsHandleCreated)
            return;

        var tracker = GetLayoutTracker(listView);
        tracker.StopLayoutTimer();

        tracker.LayoutTimer = new System.Windows.Forms.Timer { Interval = ListViewLayoutRefreshDelayMs };
        tracker.LayoutTimer.Tick += (_, _) => CompleteListViewLayoutRefresh(listView);
        tracker.LayoutTimer.Start();
    }

    private static void CompleteListViewLayoutRefresh(ListView listView)
    {
        if (!ListViewLayoutTrackers.TryGetValue(listView, out var tracker))
            return;

        tracker.StopLayoutTimer();

        if (listView.IsDisposed || !listView.IsHandleCreated)
            return;

        FillLastListViewColumn(listView);
        tracker.IsResizingColumns = false;
        listView.Refresh();
    }

    /// <summary>
    /// Stretches the last column so header and row backgrounds reach the control edge.
    /// </summary>
    public static void FillLastListViewColumn(ListView listView)
    {
        if (!listView.IsHandleCreated || listView.Columns.Count == 0 || AdjustingListViewColumnWidth.Contains(listView))
            return;

        var lastIndex = listView.Columns.Count - 1;
        var otherWidth = 0;
        for (var i = 0; i < lastIndex; i++)
            otherWidth += listView.Columns[i].Width;

        var available = listView.ClientSize.Width - otherWidth;
        const int minLastColumnWidth = 60;
        if (available < minLastColumnWidth)
            available = minLastColumnWidth;

        var lastColumn = listView.Columns[lastIndex];
        if (lastColumn.Width == available)
            return;

        AdjustingListViewColumnWidth.Add(listView);
        try
        {
            lastColumn.Width = available;
        }
        finally
        {
            AdjustingListViewColumnWidth.Remove(listView);
        }
    }

    private static int GetListViewContentRight(ListView listView) =>
        listView.ClientRectangle.Right;

    private static Rectangle ExtendToListViewContentRight(ListView listView, Rectangle columnBounds)
    {
        var right = GetListViewContentRight(listView);
        if (right <= columnBounds.Right)
            return columnBounds;

        return new Rectangle(columnBounds.Left, columnBounds.Top, right - columnBounds.Left, columnBounds.Height);
    }

    private static void OnListViewDrawColumnHeader(object? sender, DrawListViewColumnHeaderEventArgs e)
    {
        var listView = sender as ListView;
        var isLastColumn = listView is not null
            && e.ColumnIndex >= 0
            && e.ColumnIndex == listView.Columns.Count - 1;

        var fillBounds = isLastColumn && listView is not null
            ? ExtendToListViewContentRight(listView, e.Bounds)
            : e.Bounds;

        using var brush = new SolidBrush(ListHeaderBack);
        e.Graphics.FillRectangle(brush, fillBounds);

        var text = e.Header?.Text ?? string.Empty;
        var flags = TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.EndEllipsis;
        var headerTextState = e.Graphics.Save();
        e.Graphics.SetClip(e.Bounds);
        TextRenderer.DrawText(e.Graphics, text, BoldFont, e.Bounds, ListHeaderFore, flags);
        e.Graphics.Restore(headerTextState);

        using var pen = new Pen(Border);
        e.Graphics.DrawLine(pen, fillBounds.Left, fillBounds.Bottom - 1, fillBounds.Right, fillBounds.Bottom - 1);

        if (!isLastColumn)
            e.Graphics.DrawLine(pen, e.Bounds.Right - 1, e.Bounds.Top, e.Bounds.Right - 1, e.Bounds.Bottom);
    }

    private static Rectangle GetFullRowBounds(ListView listView, Rectangle firstColumnBounds)
    {
        var right = GetListViewContentRight(listView);
        var width = Math.Max(0, right - firstColumnBounds.Left);
        return new Rectangle(firstColumnBounds.Left, firstColumnBounds.Top, width, firstColumnBounds.Height);
    }

    private static Rectangle GetColumnBounds(ListViewItem item, int columnIndex)
    {
        // Always derive bounds from the live Columns widths rather than trusting
        // ListViewItem.SubItems[i].Bounds: the native control updates that cache
        // lazily, so during a column-width drag it can briefly report the previous
        // width. Painting against that stale rect leaves the old text glyphs
        // un-erased outside the (too-narrow) rect we actually repaint, which shows
        // up as ghosting while the divider is dragged.
        var listView = item.ListView!;
        var x = item.Bounds.Left;
        for (var i = 0; i < columnIndex && i < listView.Columns.Count; i++)
            x += listView.Columns[i].Width;

        if (columnIndex >= listView.Columns.Count)
            return Rectangle.Empty;

        var width = listView.Columns[columnIndex].Width;
        if (columnIndex == listView.Columns.Count - 1)
        {
            var contentRight = GetListViewContentRight(listView);
            width = Math.Max(width, contentRight - x);
        }

        return new Rectangle(x, item.Bounds.Top, width, item.Bounds.Height);
    }

    private static Rectangle InsetTextBounds(Rectangle bounds)
    {
        var inset = ListViewCellPadding;
        return new Rectangle(
            bounds.Left + inset,
            bounds.Top,
            Math.Max(0, bounds.Width - inset * 2),
            bounds.Height);
    }

    private static void OnListViewDrawItem(object? sender, DrawListViewItemEventArgs e)
    {
        if (e.Item.ListView?.View != View.Details)
        {
            e.DrawDefault = true;
            return;
        }

        e.DrawDefault = false;
        var listView = e.Item.ListView!;
        var tracker = GetLayoutTracker(listView);
        PaintListViewRow(e.Graphics, e.Item, tracker.IsResizingColumns);
    }

    private static void OnListViewDrawSubItem(object? sender, DrawListViewSubItemEventArgs e)
    {
        if (e.Item is null || e.SubItem is null || e.Item.ListView is null)
            return;

        e.DrawDefault = false;
        var listView = e.Item.ListView;
        var tracker = GetLayoutTracker(listView);

        if (tracker.IsResizingColumns)
        {
            PaintListViewRow(e.Graphics, e.Item, aggressiveErase: true);
            return;
        }

        if (e.ColumnIndex == 0)
        {
            PaintListViewRow(e.Graphics, e.Item);
            return;
        }

        PaintListViewCell(e.Graphics, e.Item, e.ColumnIndex, e.Bounds, paintBackground: true);
    }

    private static void PaintListViewRow(Graphics graphics, ListViewItem item, bool aggressiveErase = false)
    {
        var listView = item.ListView;
        if (listView is null || listView.Columns.Count == 0 || item.SubItems.Count == 0)
            return;

        var firstBounds = GetColumnBounds(item, 0);
        if (firstBounds.Height <= 0)
            return;

        var rowBounds = GetFullRowBounds(listView, firstBounds);
        if (aggressiveErase)
        {
            rowBounds = new Rectangle(
                rowBounds.Left,
                rowBounds.Top,
                Math.Max(rowBounds.Width, listView.ClientSize.Width - rowBounds.Left),
                rowBounds.Height);
        }

        var backColor = item.Selected ? SelectionBack : Surface;
        using (var brush = new SolidBrush(backColor))
            graphics.FillRectangle(brush, rowBounds);

        for (var col = 0; col < listView.Columns.Count && col < item.SubItems.Count; col++)
            PaintListViewCell(graphics, item, col, GetColumnBounds(item, col), paintBackground: false);
    }

    private static void PaintListViewCell(
        Graphics graphics,
        ListViewItem item,
        int columnIndex,
        Rectangle cellBounds,
        bool paintBackground = true)
    {
        if (cellBounds.Width <= 0 || cellBounds.Height <= 0)
            return;

        var listView = item.ListView!;
        var isLastColumn = columnIndex == listView.Columns.Count - 1;
        var text = columnIndex < item.SubItems.Count ? item.SubItems[columnIndex].Text : string.Empty;

        if (paintBackground)
        {
            var backColor = item.Selected ? SelectionBack : Surface;
            using var brush = new SolidBrush(backColor);
            graphics.FillRectangle(brush, cellBounds);
        }

        var textState = graphics.Save();
        graphics.SetClip(cellBounds);

        var flags = TextFormatFlags.VerticalCenter
                    | TextFormatFlags.Left
                    | TextFormatFlags.EndEllipsis
                    | TextFormatFlags.NoPrefix;

        TextRenderer.DrawText(
            graphics,
            text,
            BaseFont,
            InsetTextBounds(cellBounds),
            item.ForeColor,
            flags);
        graphics.Restore(textState);

        if (!listView.GridLines)
            return;

        using var pen = new Pen(Border);
        graphics.DrawLine(pen, cellBounds.Left, cellBounds.Bottom - 1, cellBounds.Right, cellBounds.Bottom - 1);
        if (!isLastColumn)
            graphics.DrawLine(pen, cellBounds.Right - 1, cellBounds.Top, cellBounds.Right - 1, cellBounds.Bottom);
    }

    private sealed class ListViewLayoutTracker
    {
        public bool IsResizingColumns;
        public System.Windows.Forms.Timer? LayoutTimer;

        public void StopLayoutTimer()
        {
            if (LayoutTimer is null)
                return;

            LayoutTimer.Stop();
            LayoutTimer.Dispose();
            LayoutTimer = null;
        }
    }

    private static void OnPanelBorderPaint(object? sender, PaintEventArgs e)
    {
        if (sender is not Control panel)
            return;

        var width = panel.ClientSize.Width;
        var height = panel.ClientSize.Height;
        if (width <= 0 || height <= 0)
            return;

        var contentLeft = panel.Padding.Left;
        var contentRight = width - panel.Padding.Right;
        var contentTop = panel.Padding.Top;
        var contentBottom = height - panel.Padding.Bottom;
        if (contentRight <= contentLeft || contentBottom <= contentTop)
            return;

        using (var gutterBrush = new SolidBrush(Background))
        {
            if (panel.Padding.Top > 0)
                e.Graphics.FillRectangle(gutterBrush, 0, 0, width, panel.Padding.Top);

            if (panel.Padding.Bottom > 0)
                e.Graphics.FillRectangle(gutterBrush, 0, height - panel.Padding.Bottom, width, panel.Padding.Bottom);

            if (panel.Padding.Left > 0)
                e.Graphics.FillRectangle(gutterBrush, 0, 0, panel.Padding.Left, height);

            if (panel.Padding.Right > 0)
                e.Graphics.FillRectangle(gutterBrush, width - panel.Padding.Right, 0, panel.Padding.Right, height);
        }

        var leftX = contentLeft - 1;
        var rightX = contentRight;
        var topY = contentTop - 1;
        var bottomY = contentBottom;
        var frameLeft = panel.Padding.Left > 0 ? leftX : 0;
        var frameRight = panel.Padding.Right > 0 ? rightX : width - 1;

        using var pen = new Pen(PanelSideBorder, 2f);
        if (panel.Padding.Left > 0)
            e.Graphics.DrawLine(pen, leftX, topY, leftX, bottomY);

        if (panel.Padding.Right > 0)
            e.Graphics.DrawLine(pen, rightX, topY, rightX, bottomY);

        if (panel.Padding.Top > 0)
            e.Graphics.DrawLine(pen, frameLeft, topY, frameRight, topY);

        if (panel.Padding.Bottom > 0)
            e.Graphics.DrawLine(pen, frameLeft, bottomY, frameRight, bottomY);
    }
}

internal class ModernColorTable : ProfessionalColorTable
{
    public override Color MenuStripGradientBegin => ModernTheme.Surface;
    public override Color MenuStripGradientEnd => ModernTheme.Surface;
    public override Color ToolStripGradientBegin => ModernTheme.Surface;
    public override Color ToolStripGradientMiddle => ModernTheme.Surface;
    public override Color ToolStripGradientEnd => ModernTheme.Surface;
    public override Color ImageMarginGradientBegin => ModernTheme.Surface;
    public override Color ImageMarginGradientMiddle => ModernTheme.Surface;
    public override Color ImageMarginGradientEnd => ModernTheme.Surface;
    public override Color MenuItemSelected => ModernTheme.AccentSoft;
    public override Color MenuItemSelectedGradientBegin => ModernTheme.AccentSoft;
    public override Color MenuItemSelectedGradientEnd => ModernTheme.AccentSoft;
    public override Color MenuItemBorder => ModernTheme.Accent;
    public override Color MenuBorder => ModernTheme.Border;
    public override Color ButtonSelectedHighlight => ModernTheme.AccentSoft;
    public override Color ButtonSelectedHighlightBorder => ModernTheme.Accent;
    public override Color ButtonPressedHighlight => ModernTheme.AccentSoft;
    public override Color ButtonPressedHighlightBorder => ModernTheme.Accent;
    public override Color ButtonCheckedHighlight => ModernTheme.AccentSoft;
    public override Color ButtonCheckedHighlightBorder => ModernTheme.Accent;
    public override Color SeparatorDark => ModernTheme.Border;
    public override Color SeparatorLight => ModernTheme.Surface;
    public override Color StatusStripGradientBegin => ModernTheme.Background;
    public override Color StatusStripGradientEnd => ModernTheme.Background;
    public override Color GripDark => ModernTheme.Border;
    public override Color GripLight => ModernTheme.Surface;
    public override Color OverflowButtonGradientBegin => ModernTheme.Surface;
    public override Color OverflowButtonGradientMiddle => ModernTheme.Surface;
    public override Color OverflowButtonGradientEnd => ModernTheme.Surface;
    public override Color RaftingContainerGradientBegin => ModernTheme.Surface;
    public override Color RaftingContainerGradientEnd => ModernTheme.Surface;
    public override Color ToolStripBorder => ModernTheme.Border;
    public override Color ToolStripDropDownBackground => ModernTheme.Surface;
    public override Color ToolStripContentPanelGradientBegin => ModernTheme.Background;
    public override Color ToolStripContentPanelGradientEnd => ModernTheme.Background;
    public override Color ToolStripPanelGradientBegin => ModernTheme.Background;
    public override Color ToolStripPanelGradientEnd => ModernTheme.Background;
}

internal class ModernToolStripRenderer : ToolStripProfessionalRenderer
{
    public ModernToolStripRenderer() : base(new ModernColorTable())
    {
        RoundedEdges = false;
    }

    protected override void OnRenderItemImage(ToolStripItemImageRenderEventArgs e)
    {
        if (e.Item is ToolStripMenuItem menuItem && menuItem.Image is not null)
        {
            var imageRect = e.ImageRectangle;
            if (imageRect.Width > 0 && imageRect.Height > 0)
            {
                if (menuItem.Enabled)
                    e.Graphics.DrawImage(menuItem.Image, imageRect);
                else
                    ControlPaint.DrawImageDisabled(e.Graphics, menuItem.Image, imageRect.X, imageRect.Y, menuItem.BackColor);
            }

            if (menuItem.Checked)
            {
                var content = menuItem.ContentRectangle;
                const int checkSize = 13;
                var checkRect = new Rectangle(
                    content.Right - checkSize - 4,
                    content.Top + (content.Height - checkSize) / 2,
                    checkSize,
                    checkSize);
                ControlPaint.DrawMenuGlyph(
                    e.Graphics,
                    checkRect,
                    MenuGlyph.Checkmark,
                    menuItem.Enabled ? menuItem.ForeColor : SystemColors.GrayText,
                    SystemColors.Window);
            }

            return;
        }

        base.OnRenderItemImage(e);
    }
}
