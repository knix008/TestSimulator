using System.Runtime.CompilerServices;
using Microsoft.Web.WebView2.WinForms;

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
        StyleControlTree(form.Controls);
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
                    label.ForeColor = label.Font.Bold ? TextPrimary : TextSecondary;
                    label.BackColor = Color.Transparent;
                    break;
                case Panel panel:
                    StyleBorderedPanel(panel, PanelEdges.All);
                    break;
            }

            if (control.HasChildren)
                StyleControlTree(control.Controls);
        }
    }

    private static bool IsPrimaryButton(Button button) =>
        button.Name is "btnOk" or "btnLogin" or "btnSave";

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

        for (var level = 0; level < node.Level; level++)
        {
            if (HasYoungerSiblingAtLevel(node, level))
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

    private static bool HasYoungerSiblingAtLevel(TreeNode node, int level)
    {
        var ancestor = node;
        while (ancestor.Level > level)
            ancestor = ancestor.Parent!;

        if (ancestor.Parent == null)
            return ancestor.TreeView!.Nodes.IndexOf(ancestor) < ancestor.TreeView.Nodes.Count - 1;

        return ancestor.Parent.Nodes.IndexOf(ancestor) < ancestor.Parent.Nodes.Count - 1;
    }

    private static bool IsLastSibling(TreeNode node)
    {
        if (node.Parent == null)
            return node.TreeView!.Nodes.IndexOf(node) == node.TreeView.Nodes.Count - 1;

        return node.Parent.Nodes.IndexOf(node) == node.Parent.Nodes.Count - 1;
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
        menuStrip.Padding = new Padding(6, 2, 6, 2);
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
        strip.Padding = new Padding(8, 0, 8, 0);
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
        button.Padding = new Padding(12, 4, 12, 4);
    }

    public static void StyleSecondaryButton(Button button)
    {
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderColor = Border;
        button.FlatAppearance.BorderSize = 1;
        button.BackColor = Surface;
        button.ForeColor = TextPrimary;
        button.Font = UiFont;
        button.Cursor = Cursors.Hand;
        button.UseVisualStyleBackColor = false;
        button.FlatAppearance.MouseOverBackColor = Background;
        button.FlatAppearance.MouseDownBackColor = BorderLight;
        button.Padding = new Padding(10, 4, 10, 4);
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
        StyleBorderedPanel(rightPanel, PanelEdges.Top | PanelEdges.Right | PanelEdges.Bottom);

        StyleSplitContainer(outerSplit);
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
