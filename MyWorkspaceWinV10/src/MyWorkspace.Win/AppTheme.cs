using System.Runtime.CompilerServices;
using Microsoft.Web.WebView2.WinForms;
using MyWorkspace.Core.Enums;

namespace MyWorkspace.Win;

[Flags]
internal enum PanelEdges
{
    None = 0,
    Left = 1,
    Top = 2,
    Right = 4,
    Bottom = 8,
    All = Left | Top | Right | Bottom
}

internal static class AppTheme
{
    private static ThemePalette _palette = ThemePalette.Light;
    private static ModernColorTable? _colorTable;
    private static ToolStripProfessionalRenderer? _renderer;
    private static readonly ConditionalWeakTable<Control, PanelBorderState> PanelBorderEdges = new();

    public static ThemePalette CurrentPalette => _palette;
    public static bool IsDark => ReferenceEquals(_palette, ThemePalette.Dark);

    public static Color Background => _palette.Background;
    public static Color Surface => _palette.Surface;
    public static Color Sidebar => _palette.Sidebar;
    public static Color Border => _palette.Border;
    public static Color BorderLight => _palette.BorderLight;
    public static Color TextPrimary => _palette.TextPrimary;
    public static Color TextSecondary => _palette.TextSecondary;
    public static Color TextMuted => _palette.TextMuted;
    public static Color Accent => _palette.Accent;
    public static Color AccentHover => _palette.AccentHover;
    public static Color AccentPressed => _palette.AccentPressed;
    public static Color Success => _palette.Success;
    public static Color Warning => _palette.Warning;
    public static Color Danger => _palette.Danger;

    public static Font UiFont { get; } = new("Segoe UI", 9F);
    public static Font UiFontSmall { get; } = new("Segoe UI", 8.25F);
    public static Font UiFontSemibold { get; } = new("Segoe UI Semibold", 9F);
    public static Font HeaderFont { get; } = new("Segoe UI Semibold", 9.5F);
    public static Font TitleFont { get; } = new("Segoe UI Semibold", 15F);

    public static event Action? Changed;

    public static void ApplyTheme(AppThemeKind theme)
    {
        _palette = theme == AppThemeKind.Dark ? ThemePalette.Dark : ThemePalette.Light;
        _colorTable = new ModernColorTable();
        _renderer = new ModernToolStripRenderer(_colorTable);
        Changed?.Invoke();
    }

    public static Color GetSaveStatusColor(SaveStatusKind kind) =>
        kind switch
        {
            SaveStatusKind.Modified => Warning,
            SaveStatusKind.Failed => Danger,
            SaveStatusKind.Saved or SaveStatusKind.AutoSaved => Success,
            _ => TextMuted
        };

    public static void ApplyStandardDialog(Form form)
    {
        ApplyFormChrome(form);
        form.Load += (_, _) => FinalizeDialogLayout(form);
        form.Shown += (_, _) => FinalizeDialogLayout(form);
        FinalizeDialogLayout(form);
    }

    public static void FinalizeDialogLayout(Form form)
    {
        StyleControlTree(form.Controls);
        FitAllButtons(form.Controls);
        AlignDialogButtonLayout(form);
    }

    private static void StyleControlTree(Control.ControlCollection controls)
    {
        foreach (Control control in controls)
        {
            switch (control)
            {
                case Button button when IsPrimaryButton(button):
                    StylePrimaryButton(button);
                    break;
                case Button button:
                    StyleSecondaryButton(button);
                    break;
                case TextBox textBox:
                    StyleTextBox(textBox);
                    break;
                case Label label:
                    StyleDialogLabel(label);
                    break;
                case RadioButton radio:
                    radio.ForeColor = TextPrimary;
                    radio.BackColor = Color.Transparent;
                    break;
                case CheckBox checkBox:
                    checkBox.ForeColor = TextPrimary;
                    checkBox.BackColor = Color.Transparent;
                    break;
                case GroupBox groupBox:
                    groupBox.ForeColor = TextPrimary;
                    groupBox.BackColor = Background;
                    break;
                case DataGridView grid:
                    StyleDataGridView(grid);
                    break;
                case ListBox listBox:
                    StyleListBox(listBox);
                    break;
                case ComboBox comboBox:
                    StyleComboBox(comboBox);
                    break;
                case Panel panel:
                    StylePanel(panel);
                    break;
            }

            if (control.HasChildren)
                StyleControlTree(control.Controls);
        }
    }

    private static void StyleDialogLabel(Label label)
    {
        label.ForeColor = label.Font.Bold ? TextPrimary : TextSecondary;
        label.BackColor = Color.Transparent;

        if (label.AutoSize)
            return;

        if (label.Width <= 0)
            return;

        if (label.Height <= label.Font.Height + 6)
        {
            label.AutoEllipsis = true;
            return;
        }

        var maxWidth = label.Width;
        label.AutoSize = true;
        label.MaximumSize = new Size(maxWidth, 0);
    }

    private static void FitAllButtons(Control.ControlCollection controls)
    {
        foreach (Control control in controls)
        {
            if (control is Button button)
                FitButtonSize(button);

            if (control.HasChildren)
                FitAllButtons(control.Controls);
        }
    }

    private static void AlignDialogButtonLayout(Form form)
    {
        AlignFooterPanels(form.Controls);
        AlignAnchoredBottomButtons(form);
    }

    private static void AlignFooterPanels(Control.ControlCollection controls)
    {
        foreach (Control control in controls)
        {
            if (control is Panel panel && IsButtonFooterPanel(panel))
                AlignFooterPanelButtons(panel);

            if (control.HasChildren)
                AlignFooterPanels(control.Controls);
        }
    }

    private static void AlignFooterPanelButtons(Panel footer)
    {
        const int rightPadding = 12;
        const int gap = 8;

        var rightAnchored = footer.Controls.OfType<Button>()
            .Where(button => (button.Anchor & AnchorStyles.Right) != 0)
            .OrderBy(button => button.Left)
            .ToList();

        if (rightAnchored.Count == 0)
            return;

        var x = footer.ClientSize.Width - rightPadding;
        for (var index = rightAnchored.Count - 1; index >= 0; index--)
        {
            var button = rightAnchored[index];
            x -= button.Width;
            button.Location = new Point(x, button.Top);
            x -= gap;
        }
    }

    private static void AlignAnchoredBottomButtons(Control container)
    {
        const int bottomPadding = 12;
        const int rightPadding = 12;
        const int gap = 8;

        var bottomButtons = container.Controls.OfType<Button>()
            .Where(button => (button.Anchor & AnchorStyles.Bottom) != 0)
            .OrderBy(button => button.Left)
            .ToList();

        if (bottomButtons.Count == 0)
            return;

        var bottom = container.ClientSize.Height - bottomPadding;
        var x = container.ClientSize.Width - rightPadding;

        for (var index = bottomButtons.Count - 1; index >= 0; index--)
        {
            var button = bottomButtons[index];
            x -= button.Width;
            button.Location = new Point(x, bottom - button.Height);
            x -= gap;
        }
    }

    private static bool IsPrimaryButton(Button button) =>
        button.Name is "btnOk" or "btnLogin" or "btnSave"
        || button.DialogResult == DialogResult.OK;

    private static bool IsButtonFooterPanel(Panel panel) =>
        panel.Dock == DockStyle.Bottom &&
        panel.Controls.Count > 0 &&
        panel.Controls.Cast<Control>().All(static c => c is Button);

    private static void StylePanel(Panel panel)
    {
        panel.BackColor = Background;

        if (IsButtonFooterPanel(panel))
            StyleBorderedPanel(panel, PanelEdges.Top);
        else
            StyleBorderedPanel(panel, PanelEdges.All);
    }

    public static void ApplyFormChrome(Form form)
    {
        form.BackColor = Background;
        form.Font = UiFont;
        form.ForeColor = TextPrimary;

        if (form.ShowIcon)
            form.Icon = IconAssets.CreateAppIcon();
    }

    public static void StyleTreeNodeDraw(object? sender, DrawTreeNodeEventArgs e)
    {
        if (sender is not TreeView tree || e.Node == null)
            return;

        var selected = (e.State & TreeNodeStates.Selected) != 0;
        var bg = selected ? AccentHover : tree.BackColor;
        var fg = selected ? Accent : tree.ForeColor;

        e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.None;
        e.Graphics.CompositingQuality = System.Drawing.Drawing2D.CompositingQuality.HighSpeed;

        var rowBounds = new Rectangle(0, e.Bounds.Top, tree.ClientSize.Width, e.Bounds.Height);
        using (var brush = new SolidBrush(bg))
            e.Graphics.FillRectangle(brush, rowBounds);

        DrawTreeLines(e.Graphics, tree, e.Node, rowBounds);

        if (tree.ShowPlusMinus && e.Node.Nodes.Count > 0)
            DrawTreeExpandGlyph(e.Graphics, tree, e.Node, rowBounds, fg);

        var icon = GetTreeNodeImage(tree, e.Node);
        var textLeft = GetTreeNodeTextLeft(tree, e.Node, icon != null);
        if (icon != null)
        {
            var iconSize = tree.ImageList!.ImageSize;
            var iconTop = rowBounds.Top + (rowBounds.Height - iconSize.Height) / 2;
            e.Graphics.DrawImage(icon, GetTreeNodeIconLeft(tree, e.Node), iconTop, iconSize.Width, iconSize.Height);
        }

        var textBounds = new Rectangle(
            textLeft,
            rowBounds.Top,
            Math.Max(0, tree.ClientSize.Width - textLeft - 4),
            rowBounds.Height);

        TextRenderer.DrawText(
            e.Graphics,
            e.Node.Text,
            tree.Font,
            textBounds,
            fg,
            TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPadding);
    }

    private static Image? GetTreeNodeImage(TreeView tree, TreeNode node)
    {
        if (tree.ImageList == null)
            return null;

        var key = !string.IsNullOrEmpty(node.ImageKey) ? node.ImageKey : node.SelectedImageKey;
        if (string.IsNullOrEmpty(key) || !tree.ImageList.Images.ContainsKey(key))
            return null;

        return tree.ImageList.Images[key];
    }

    private static int GetTreeNodeIconLeft(TreeView tree, TreeNode node)
    {
        var left = node.Level * tree.Indent;
        if (tree.ShowPlusMinus)
            left += 9;

        return left;
    }

    private static void DrawTreeLines(Graphics graphics, TreeView tree, TreeNode node, Rectangle rowBounds)
    {
        if (!tree.ShowLines)
            return;

        var top = rowBounds.Top;
        var bottom = rowBounds.Bottom;
        var centerY = top + rowBounds.Height / 2;
        var indent = tree.Indent;
        const int glyphWidth = 9;
        var lineXOffset = indent / 2;

        using var pen = new Pen(Border);

        for (var level = 0; level < node.Level - 1; level++)
        {
            if (HasSiblingBelowAtLevel(node, level))
            {
                var x = level * indent + lineXOffset;
                graphics.DrawLine(pen, x, top, x, bottom);
            }
        }

        if (node.Level == 0 && !tree.ShowRootLines)
            return;

        var connectorX = node.Level > 0
            ? (node.Level - 1) * indent + lineXOffset
            : lineXOffset;
        var nodeX = node.Level * indent + glyphWidth / 2;

        graphics.DrawLine(pen, connectorX, centerY, nodeX, centerY);

        if (IsLastSibling(node))
            graphics.DrawLine(pen, connectorX, top, connectorX, centerY);
        else
            graphics.DrawLine(pen, connectorX, top, connectorX, bottom);
    }

    private static bool IsLastSibling(TreeNode node)
    {
        var siblings = node.Parent?.Nodes ?? node.TreeView!.Nodes;
        return siblings.IndexOf(node) == siblings.Count - 1;
    }

    private static bool HasSiblingBelowAtLevel(TreeNode node, int level)
    {
        var ancestor = node;
        while (ancestor.Level > level + 1)
            ancestor = ancestor.Parent!;

        var siblings = ancestor.Parent?.Nodes ?? ancestor.TreeView!.Nodes;
        return siblings.IndexOf(ancestor) < siblings.Count - 1;
    }

    private static int GetTreeNodeTextLeft(TreeView tree, TreeNode node, bool hasIcon)
    {
        var left = GetTreeNodeIconLeft(tree, node);
        if (hasIcon && tree.ImageList != null)
            left += tree.ImageList.ImageSize.Width + 3;

        return left;
    }

    private static void DrawTreeExpandGlyph(Graphics graphics, TreeView tree, TreeNode node, Rectangle rowBounds, Color color)
    {
        const int glyphSize = 9;
        var left = node.Level * tree.Indent;
        var top = rowBounds.Top + (rowBounds.Height - glyphSize) / 2;
        var rect = new Rectangle(left, top, glyphSize, glyphSize);

        using var pen = new Pen(color, 1f);
        graphics.DrawRectangle(pen, rect);

        var midY = rect.Top + rect.Height / 2;
        var midX = rect.Left + rect.Width / 2;
        graphics.DrawLine(pen, rect.Left + 2, midY, rect.Right - 2, midY);
        if (!node.IsExpanded)
            graphics.DrawLine(pen, midX, rect.Top + 2, midX, rect.Bottom - 2);
    }

    public static void ApplyToolStrip(ToolStrip strip)
    {
        EnsureRenderer();
        strip.ShowItemToolTips = true;
        strip.BackColor = Surface;
        strip.ForeColor = TextPrimary;
        strip.RenderMode = ToolStripRenderMode.Professional;
        strip.Renderer = _renderer!;
        strip.Font = UiFont;
        ApplyToolStripItems(strip.Items);
    }

    public static void ApplyToolStripItems(ToolStripItemCollection items)
    {
        EnsureRenderer();

        foreach (ToolStripItem item in items)
        {
            if (item is ToolStripSeparator)
                continue;

            item.ForeColor = item.Enabled ? TextPrimary : TextMuted;

            if (item is not ToolStripDropDownItem dropDownItem)
                continue;

            var dropDown = dropDownItem.DropDown;
            dropDown.BackColor = Surface;
            dropDown.ForeColor = TextPrimary;
            dropDown.RenderMode = ToolStripRenderMode.Professional;
            dropDown.Renderer = _renderer!;

            if (dropDownItem.HasDropDownItems)
                ApplyToolStripItems(dropDownItem.DropDownItems);
        }
    }

    public static void ApplyMenuStrip(MenuStrip menuStrip)
    {
        ApplyToolStrip(menuStrip);
        menuStrip.Padding = new Padding(8, 5, 8, 5);
        menuStrip.ImageScalingSize = new Size(18, 18);
    }

    public static void ApplyToolbar(ToolStrip strip)
    {
        ApplyToolStrip(strip);
        strip.GripStyle = ToolStripGripStyle.Hidden;
        strip.Padding = new Padding(8, 4, 8, 4);
    }

    public static void ApplyStatusStrip(StatusStrip strip)
    {
        ApplyToolStrip(strip);
        strip.Font = UiFontSmall;
        strip.Padding = new Padding(10, 5, 10, 5);
        strip.SizingGrip = false;
        strip.BackColor = Surface;
    }

    public static void StyleContextMenu(ContextMenuStrip menu)
    {
        ApplyToolStrip(menu);
        menu.ShowImageMargin = true;
    }

    public static void StyleTreeView(TreeView tree)
    {
        tree.BorderStyle = BorderStyle.None;
        tree.BackColor = Sidebar;
        tree.ForeColor = TextPrimary;
        tree.Font = UiFont;
        tree.ItemHeight = 26;
        tree.Indent = 16;
        tree.ShowLines = true;
        tree.ShowRootLines = true;
        tree.ShowPlusMinus = true;
        tree.FullRowSelect = true;
        tree.HideSelection = false;
        tree.DrawMode = TreeViewDrawMode.OwnerDrawAll;
        tree.DrawNode -= TreeView_DrawNode;
        tree.DrawNode += TreeView_DrawNode;
    }

    public static void StyleTextBox(TextBox textBox)
    {
        textBox.BorderStyle = BorderStyle.FixedSingle;
        textBox.BackColor = Surface;
        textBox.ForeColor = TextPrimary;
        if (textBox.Font?.Name == "Microsoft Sans Serif")
            textBox.Font = UiFont;
    }

    public static void StyleDataGridView(DataGridView grid)
    {
        grid.EnableHeadersVisualStyles = false;
        grid.BackgroundColor = Surface;
        grid.GridColor = Border;
        grid.BorderStyle = BorderStyle.FixedSingle;
        grid.CellBorderStyle = DataGridViewCellBorderStyle.SingleHorizontal;
        grid.RowHeadersVisible = false;
        grid.DefaultCellStyle.BackColor = Surface;
        grid.DefaultCellStyle.ForeColor = TextPrimary;
        grid.DefaultCellStyle.SelectionBackColor = AccentHover;
        grid.DefaultCellStyle.SelectionForeColor = Accent;
        grid.DefaultCellStyle.Font = UiFont;

        grid.ColumnHeadersDefaultCellStyle.BackColor = IsDark ? BorderLight : Background;
        grid.ColumnHeadersDefaultCellStyle.ForeColor = TextPrimary;
        grid.ColumnHeadersDefaultCellStyle.Font = UiFontSemibold;
        grid.ColumnHeadersDefaultCellStyle.SelectionBackColor = grid.ColumnHeadersDefaultCellStyle.BackColor;
        grid.ColumnHeadersDefaultCellStyle.SelectionForeColor = TextPrimary;

        grid.AlternatingRowsDefaultCellStyle.BackColor = IsDark ? BorderLight : Sidebar;
        grid.AlternatingRowsDefaultCellStyle.ForeColor = TextPrimary;
        grid.AlternatingRowsDefaultCellStyle.SelectionBackColor = AccentHover;
        grid.AlternatingRowsDefaultCellStyle.SelectionForeColor = Accent;
    }

    public static void StyleListBox(ListBox listBox)
    {
        listBox.BackColor = Surface;
        listBox.ForeColor = TextPrimary;
        listBox.BorderStyle = BorderStyle.FixedSingle;
        if (listBox.Font?.Name == "Microsoft Sans Serif")
            listBox.Font = UiFont;
    }

    public static void StyleComboBox(ComboBox comboBox)
    {
        if (comboBox is ThemedComboBox themedComboBox)
        {
            themedComboBox.ApplyTheme();
            return;
        }

        comboBox.BackColor = Surface;
        comboBox.ForeColor = TextPrimary;
        comboBox.FlatStyle = FlatStyle.Flat;
        comboBox.DrawMode = DrawMode.OwnerDrawFixed;
        comboBox.ItemHeight = Math.Max(22, comboBox.Font.Height + 8);
        comboBox.DrawItem -= DrawComboBoxItem;
        comboBox.DrawItem += DrawComboBoxItem;
        if (comboBox.Font?.Name == "Microsoft Sans Serif")
            comboBox.Font = UiFont;
    }

    private static void DrawComboBoxItem(object? sender, DrawItemEventArgs e)
    {
        if (sender is not ComboBox comboBox || e.Index < 0)
            return;

        var selected = (e.State & DrawItemState.Selected) != 0;
        var background = selected ? AccentHover : Surface;
        var foreground = TextPrimary;

        using (var backgroundBrush = new SolidBrush(background))
            e.Graphics.FillRectangle(backgroundBrush, e.Bounds);

        var text = GetComboBoxItemText(comboBox, e.Index);
        var font = e.Font ?? comboBox.Font;
        var textBounds = new Rectangle(e.Bounds.X + 4, e.Bounds.Y, e.Bounds.Width - 8, e.Bounds.Height);
        TextRenderer.DrawText(
            e.Graphics,
            text,
            font,
            textBounds,
            foreground,
            TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);

        if ((e.State & DrawItemState.Focus) == DrawItemState.Focus)
            e.DrawFocusRectangle();
    }

    private static string GetComboBoxItemText(ComboBox comboBox, int index)
    {
        if (index < 0 || index >= comboBox.Items.Count)
            return string.Empty;

        var item = comboBox.Items[index];
        if (item == null)
            return string.Empty;

        if (!string.IsNullOrWhiteSpace(comboBox.DisplayMember))
        {
            var property = item.GetType().GetProperty(comboBox.DisplayMember);
            if (property?.GetValue(item) is { } value)
                return value.ToString() ?? string.Empty;
        }

        return item.ToString() ?? string.Empty;
    }

    public static void StylePrimaryButton(Button button)
    {
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderSize = 0;
        button.BackColor = Accent;
        button.ForeColor = Color.White;
        button.Font = UiFontSemibold;
        button.Cursor = Cursors.Hand;
        button.UseVisualStyleBackColor = false;
        button.FlatAppearance.MouseOverBackColor = _palette.AccentHoverButton;
        button.FlatAppearance.MouseDownBackColor = _palette.AccentPressedButton;
        button.Padding = new Padding(12, 2, 12, 2);
        EnsureButtonHeight(button);
    }

    public static void StyleSecondaryButton(Button button)
    {
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderSize = 1;
        button.FlatAppearance.BorderColor = IsDark ? TextMuted : Border;
        button.BackColor = IsDark ? BorderLight : Surface;
        button.ForeColor = TextPrimary;
        button.Font = UiFont;
        button.Cursor = Cursors.Hand;
        button.UseVisualStyleBackColor = false;
        button.FlatAppearance.MouseOverBackColor = IsDark ? Border : Background;
        button.FlatAppearance.MouseDownBackColor = IsDark ? TextMuted : BorderLight;
        button.Padding = new Padding(10, 2, 10, 2);
        EnsureButtonHeight(button);
    }

    public static void FitButtonSize(Button button, int minWidth = 84, int height = 32)
    {
        if (string.IsNullOrEmpty(button.Text))
        {
            EnsureButtonHeight(button);
            return;
        }

        const TextFormatFlags flags = TextFormatFlags.SingleLine | TextFormatFlags.NoPadding;
        var textSize = TextRenderer.MeasureText(
            button.Text,
            button.Font,
            new Size(int.MaxValue, int.MaxValue),
            flags);
        var horizontalPadding = button.Padding.Horizontal + 28;
        var verticalPadding = button.Padding.Vertical + 8;
        var width = Math.Max(minWidth, textSize.Width + horizontalPadding);
        var fittedHeight = Math.Max(height, textSize.Height + verticalPadding);

        button.AutoSize = false;
        button.Size = new Size(width, fittedHeight);
        button.MinimumSize = new Size(width, fittedHeight);
    }

    private static void EnsureButtonHeight(Button button)
    {
        const int minHeight = 32;
        if (button.Height < minHeight)
            button.Height = minHeight;
        if (button.MinimumSize.Height < minHeight)
            button.MinimumSize = new Size(button.MinimumSize.Width, minHeight);
    }

    public static void StyleOutlineToggleButton(Button button)
    {
        button.AutoSize = false;
        button.Dock = DockStyle.Right;
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderSize = 0;
        button.BackColor = Surface;
        button.ForeColor = TextSecondary;
        button.Font = UiFontSmall;
        button.Cursor = Cursors.Hand;
        button.UseVisualStyleBackColor = false;
        button.TextAlign = ContentAlignment.MiddleRight;
        button.Padding = new Padding(4, 0, 0, 0);
        button.MinimumSize = new Size(84, 24);
        button.FlatAppearance.MouseOverBackColor = Background;
        button.FlatAppearance.MouseDownBackColor = BorderLight;
    }

    public static void StyleHeaderPanel(Panel panel)
    {
        panel.BackColor = Surface;
        StyleBorderedPanel(panel, PanelEdges.Bottom);
    }

    public static void StyleBorderedPanel(Panel panel, PanelEdges edges)
    {
        panel.Paint -= DrawPanelBorder;
        PanelBorderEdges.Remove(panel);

        if (edges == PanelEdges.None)
            return;

        PanelBorderEdges.Add(panel, new PanelBorderState(edges));
        panel.Paint += DrawPanelBorder;
        panel.Invalidate();
    }

    private sealed class PanelBorderState(PanelEdges edges)
    {
        public PanelEdges Edges { get; } = edges;
    }

    public static void StyleSplitContainer(SplitContainer split)
    {
        split.BackColor = Border;
        split.Panel1.BackColor = Sidebar;
        split.Panel2.BackColor = Surface;
    }

    public static void StyleSectionLabel(Label label)
    {
        label.Font = HeaderFont;
        label.ForeColor = TextSecondary;
        label.BackColor = Color.Transparent;
    }

    public static void ApplyMainShell(
        MenuStrip menuStrip,
        ToolStrip toolbar,
        StatusStrip statusStrip,
        ContextMenuStrip treeContextMenu,
        TreeView workspaceTree,
        TreeView outlineTree,
        Panel outlineSidebar,
        Panel outlineHeader,
        Label outlineLabel,
        Button toggleOutlineButton,
        Panel titlePanel,
        Label titleCaption,
        TextBox titleBox,
        Panel workspaceHost,
        Panel rightPanel,
        SplitContainer outerSplit,
        SplitContainer editorSplit,
        WebView2 webViewEditor,
        ToolStripStatusLabel statusLabel,
        ToolStripStatusLabel saveStatusLabel)
    {
        ApplyFormChrome(menuStrip.FindForm()!);
        ApplyMenuStrip(menuStrip);
        ApplyToolbar(toolbar);
        ApplyStatusStrip(statusStrip);
        StyleContextMenu(treeContextMenu);
        StyleTreeView(workspaceTree);
        StyleTreeView(outlineTree);

        outlineSidebar.BackColor = Sidebar;
        StyleBorderedPanel(outlineSidebar, PanelEdges.All);
        outlineHeader.Padding = new Padding(10, 4, 8, 4);
        outlineHeader.MinimumSize = new Size(0, 36);
        outlineHeader.Height = Math.Max(outlineHeader.Height, 36);
        StyleHeaderPanel(outlineHeader);
        StyleSectionLabel(outlineLabel);
        StyleOutlineToggleButton(toggleOutlineButton);

        titlePanel.Height = 48;
        titlePanel.Padding = new Padding(16, 10, 16, 10);
        StyleHeaderPanel(titlePanel);
        StyleSectionLabel(titleCaption);
        StyleTextBox(titleBox);
        titleBox.Font = new Font("Segoe UI", 11F);

        rightPanel.BackColor = Surface;
        rightPanel.Padding = new Padding(0, 0, 12, 0);
        StyleBorderedPanel(rightPanel, PanelEdges.Top | PanelEdges.Right | PanelEdges.Bottom);

        StyleSplitContainer(outerSplit);
        workspaceHost.BackColor = Sidebar;
        workspaceHost.Padding = new Padding(12, 8, 4, 8);
        StyleBorderedPanel(outerSplit.Panel1, PanelEdges.Top | PanelEdges.Left | PanelEdges.Bottom);

        StyleSplitContainer(editorSplit);
        StyleBorderedPanel(editorSplit.Panel2, PanelEdges.Top | PanelEdges.Right | PanelEdges.Bottom);
        webViewEditor.DefaultBackgroundColor = Surface;

        statusLabel.ForeColor = TextSecondary;
        saveStatusLabel.ForeColor = TextMuted;
    }

    private static void EnsureRenderer()
    {
        _colorTable ??= new ModernColorTable();
        _renderer ??= new ModernToolStripRenderer(_colorTable);
    }

    private sealed class ModernToolStripRenderer : ToolStripProfessionalRenderer
    {
        public ModernToolStripRenderer(ProfessionalColorTable colorTable)
            : base(colorTable)
        {
        }

        protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
        {
            e.TextColor = !e.Item.Enabled
                ? TextMuted
                : e.Item.Selected || e.Item.Pressed
                    ? Accent
                    : TextPrimary;
            base.OnRenderItemText(e);
        }

        protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e)
        {
            if (e.ToolStrip is MenuStrip or ContextMenuStrip or ToolStripDropDown)
            {
                using var pen = new Pen(Border);
                var bounds = new Rectangle(Point.Empty, e.ToolStrip.Size);
                bounds.Width -= 1;
                bounds.Height -= 1;
                e.Graphics.DrawRectangle(pen, bounds);
                return;
            }

            base.OnRenderToolStripBorder(e);
        }
    }

    private static void DrawPanelBorder(object? sender, PaintEventArgs e)
    {
        if (sender is not Control control ||
            !PanelBorderEdges.TryGetValue(control, out var state) ||
            state.Edges == PanelEdges.None)
            return;

        var edges = state.Edges;

        var width = control.ClientSize.Width;
        var height = control.ClientSize.Height;
        if (width <= 0 || height <= 0)
            return;

        using var pen = new Pen(Border);
        if ((edges & PanelEdges.Left) != 0)
            e.Graphics.DrawLine(pen, 0, 0, 0, height - 1);
        if ((edges & PanelEdges.Top) != 0)
            e.Graphics.DrawLine(pen, 0, 0, width - 1, 0);
        if ((edges & PanelEdges.Right) != 0)
            e.Graphics.DrawLine(pen, width - 1, 0, width - 1, height - 1);
        if ((edges & PanelEdges.Bottom) != 0)
            e.Graphics.DrawLine(pen, 0, height - 1, width - 1, height - 1);
    }

    private static void TreeView_DrawNode(object? sender, DrawTreeNodeEventArgs e) =>
        StyleTreeNodeDraw(sender, e);

    private sealed class ModernColorTable : ProfessionalColorTable
    {
        public override Color ToolStripGradientBegin => Surface;
        public override Color ToolStripGradientMiddle => Surface;
        public override Color ToolStripGradientEnd => Surface;
        public override Color MenuBorder => Border;
        public override Color MenuItemBorder => AccentHover;
        public override Color MenuItemSelected => AccentHover;
        public override Color MenuItemSelectedGradientBegin => AccentHover;
        public override Color MenuItemSelectedGradientEnd => AccentHover;
        public override Color MenuItemPressedGradientBegin => AccentPressed;
        public override Color MenuItemPressedGradientMiddle => AccentPressed;
        public override Color MenuItemPressedGradientEnd => AccentPressed;
        public override Color MenuStripGradientBegin => Surface;
        public override Color MenuStripGradientEnd => Surface;
        public override Color ImageMarginGradientBegin => Surface;
        public override Color ImageMarginGradientMiddle => Surface;
        public override Color ImageMarginGradientEnd => Surface;
        public override Color SeparatorDark => Border;
        public override Color SeparatorLight => BorderLight;
        public override Color StatusStripGradientBegin => Surface;
        public override Color StatusStripGradientEnd => Surface;
        public override Color ToolStripBorder => Border;
        public override Color ButtonSelectedBorder => Accent;
        public override Color ButtonCheckedGradientBegin => AccentHover;
        public override Color ButtonCheckedGradientMiddle => AccentHover;
        public override Color ButtonCheckedGradientEnd => AccentHover;
        public override Color ButtonSelectedGradientBegin => AccentHover;
        public override Color ButtonSelectedGradientMiddle => AccentHover;
        public override Color ButtonSelectedGradientEnd => AccentHover;
        public override Color ButtonPressedGradientBegin => AccentPressed;
        public override Color ButtonPressedGradientMiddle => AccentPressed;
        public override Color ButtonPressedGradientEnd => AccentPressed;
        public override Color OverflowButtonGradientBegin => Surface;
        public override Color OverflowButtonGradientMiddle => Surface;
        public override Color OverflowButtonGradientEnd => Surface;
    }
}
