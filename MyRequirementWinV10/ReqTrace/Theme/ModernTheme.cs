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

    public static readonly Font BaseFont = new("Segoe UI", 9.5f, FontStyle.Regular);
    public static readonly Font BoldFont = new("Segoe UI", 9.5f, FontStyle.Bold);

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
                textBox.BackColor = textBox.ReadOnly ? Background : Surface;
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
        listView.DrawColumnHeader -= OnListViewDrawColumnHeader;
        listView.DrawColumnHeader += OnListViewDrawColumnHeader;
        listView.DrawItem -= OnListViewDrawItem;
        listView.DrawItem += OnListViewDrawItem;
        listView.DrawSubItem -= OnListViewDrawSubItem;
        listView.DrawSubItem += OnListViewDrawSubItem;
    }

    private static void OnListViewDrawColumnHeader(object? sender, DrawListViewColumnHeaderEventArgs e)
    {
        using var brush = new SolidBrush(ListHeaderBack);
        e.Graphics.FillRectangle(brush, e.Bounds);

        var text = e.Header?.Text ?? string.Empty;
        var flags = TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.EndEllipsis;
        TextRenderer.DrawText(e.Graphics, text, BoldFont, e.Bounds, ListHeaderFore, flags);

        using var pen = new Pen(Border);
        e.Graphics.DrawLine(pen, e.Bounds.Left, e.Bounds.Bottom - 1, e.Bounds.Right, e.Bounds.Bottom - 1);
        e.Graphics.DrawLine(pen, e.Bounds.Right - 1, e.Bounds.Top, e.Bounds.Right - 1, e.Bounds.Bottom);
    }

    private static void OnListViewDrawItem(object? sender, DrawListViewItemEventArgs e)
    {
        if (e.Item.ListView?.View != View.Details)
            e.DrawDefault = true;
        else
            e.DrawDefault = false;
    }

    private static void OnListViewDrawSubItem(object? sender, DrawListViewSubItemEventArgs e)
    {
        if (e.Item is null || e.SubItem is null)
            return;

        e.DrawDefault = false;
        DrawListViewCell(
            e.Graphics,
            e.SubItem.Text,
            e.Bounds,
            e.Item.Selected,
            e.Item.ForeColor,
            e.Item.ListView?.GridLines == true);
    }

    private static void DrawListViewCell(Graphics graphics, string text, Rectangle bounds, bool selected, Color itemForeColor, bool drawGridLines)
    {
        var backColor = selected ? SelectionBack : Surface;
        var foreColor = selected ? itemForeColor : itemForeColor;

        using (var brush = new SolidBrush(backColor))
            graphics.FillRectangle(brush, bounds);

        var flags = TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.EndEllipsis;
        TextRenderer.DrawText(graphics, text, BaseFont, bounds, foreColor, flags);

        if (!drawGridLines)
            return;

        using var pen = new Pen(Border);
        graphics.DrawLine(pen, bounds.Left, bounds.Bottom - 1, bounds.Right, bounds.Bottom - 1);
        graphics.DrawLine(pen, bounds.Right - 1, bounds.Top, bounds.Right - 1, bounds.Bottom);
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
