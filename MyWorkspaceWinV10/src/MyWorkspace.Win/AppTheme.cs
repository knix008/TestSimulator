using System.Reflection;
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

internal enum PanelHeaderKind
{
    Workspace,
    Outline,
    Editor,
    PageTitle
}

internal static class AppTheme
{
    private static ThemePalette _palette = ThemePalette.Light;
    private static AppThemeKind _themeKind = AppThemeKind.Light;
    private static Color _pastelAccent = PastelThemeCatalog.DefaultAccent;
    private static ModernColorTable? _colorTable;
    private static ToolStripProfessionalRenderer? _renderer;
    private static ModernColorTable? _sidebarToolbarColorTable;
    private static ToolStripProfessionalRenderer? _sidebarToolbarRenderer;
    private static readonly ConditionalWeakTable<Control, PanelBorderState> PanelBorderEdges = new();

    public static ThemePalette CurrentPalette => _palette;
    public static bool IsDark => _themeKind == AppThemeKind.Dark;
    public static Color PastelAccent => _pastelAccent;
    public static Color TitleBarBackground => _palette.Sidebar;
    public static Color TitleBarText => _palette.TextPrimary;

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
    public static Color EditorCodeBackground => _palette.EditorCodeBackground;
    public static Color EditorBackground => Sidebar;
    public static Color EditorText => _palette.EditorText;
    public static Color PanelHeaderWorkspace => _palette.PanelHeaderWorkspace;
    public static Color PanelHeaderOutline => _palette.PanelHeaderOutline;
    public static Color PanelHeaderEditor => _palette.PanelHeaderEditor;
    public static Color PanelHeaderPageTitle => _palette.PanelHeaderPageTitle;

    public const int VerticalToolbarWidth = 52;
    public const int VerticalToolbarButtonSize = 44;
    public const int VerticalToolbarIconSize = 24;
    public const int ShellBorderWidth = 1;
    public const int SplitterBorderWidth = 1;

    public static Color ShellBorder => ResolveShellBorder();

    public static Pen CreateShellBorderPen() => new(ShellBorder, ShellBorderWidth);

    public static Pen CreatePanelDividerPen() => new(BorderLight, ShellBorderWidth);

    private static Color ResolveShellBorder()
    {
        const double minContrast = 1.35;
        if (GetContrastRatio(Border, Background) >= minContrast)
            return Border;

        var adjusted = IsDark
            ? BlendColors(Border, TextSecondary, 0.55f)
            : BlendColors(Border, TextMuted, 0.65f);
        if (GetContrastRatio(adjusted, Background) >= minContrast)
            return adjusted;

        return IsDark
            ? BlendColors(TextSecondary, Border, 0.35f)
            : BlendColors(TextMuted, Border, 0.45f);
    }

    private static double GetContrastRatio(Color foreground, Color background)
    {
        var l1 = GetRelativeLuminance(foreground);
        var l2 = GetRelativeLuminance(background);
        var lighter = Math.Max(l1, l2);
        var darker = Math.Min(l1, l2);
        return (lighter + 0.05) / (darker + 0.05);
    }

    private static double GetRelativeLuminance(Color color)
    {
        static double Channel(int value)
        {
            var channel = value / 255d;
            return channel <= 0.03928
                ? channel / 12.92
                : Math.Pow((channel + 0.055) / 1.055, 2.4);
        }

        var r = Channel(color.R);
        var g = Channel(color.G);
        var b = Channel(color.B);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    private const float BaseUiFontSize = 9F;
    private const float BaseUiFontSmallSize = 8.25F;
    private const float BaseUiFontSemiboldSize = 9F;
    private const float BaseHeaderFontSize = 9.5F;
    private const float BasePanelTitleFontSize = 11F;
    private const float BasePageTitleCaptionFontSize = 13F;
    private const float BasePageTitleTextFontSize = 12F;
    private const float BaseTitleFontSize = 15F;
    private const float BaseEditorContentFontSize = 15F;

    private static float _fontScaleFactor = 1F;
    private static int _fontScaleStep;

    private static Font _uiFont = null!;
    private static Font _uiFontSmall = null!;
    private static Font _uiFontSemibold = null!;
    private static Font _headerFont = null!;
    private static Font _panelTitleFont = null!;
    private static Font _pageTitleCaptionFont = null!;
    private static Font _pageTitleTextFont = null!;
    private static Font _titleFont = null!;

    static AppTheme()
    {
        RefreshFonts();
    }

    public static Font UiFont => _uiFont;
    public static Font UiFontSmall => _uiFontSmall;
    public static Font UiFontSemibold => _uiFontSemibold;
    public static Font HeaderFont => _headerFont;
    public static Font PanelTitleFont => _panelTitleFont;
    public static Font PageTitleCaptionFont => _pageTitleCaptionFont;
    public static Font PageTitleTextFont => _pageTitleTextFont;
    public static Font TitleFont => _titleFont;
    public static Font CloneUiFont() => (Font)_uiFont.Clone();
    public static float FontScaleFactor => _fontScaleFactor;
    public static int FontScaleStep => _fontScaleStep;
    public static float EditorContentFontSize => ScaleSize(BaseEditorContentFontSize);

    public static event Action? Changed;

    public static void ApplyAppearance(AppThemeKind theme, int fontScaleStep, Color? pastelAccent = null)
    {
        _themeKind = theme;
        _pastelAccent = pastelAccent ?? PastelThemeCatalog.DefaultAccent;
        _palette = PastelThemePaletteBuilder.Build(_pastelAccent, theme == AppThemeKind.Dark);
        _fontScaleStep = UiFontScale.Normalize(fontScaleStep);
        _fontScaleFactor = UiFontScale.GetFactor(_fontScaleStep);
        RefreshFonts();
        _colorTable = new ModernColorTable(Surface);
        _renderer = new ModernToolStripRenderer(_colorTable);
        _sidebarToolbarColorTable = new ModernColorTable(Sidebar);
        _sidebarToolbarRenderer = new ModernToolStripRenderer(_sidebarToolbarColorTable, sidebarStyle: true);
        Changed?.Invoke();
    }

    public static void ApplyAppearance(UiSettings settings) =>
        ApplyAppearance(settings.Theme, settings.FontScaleStep, PastelThemeResolver.ResolveAccent(settings));

    public static void ApplyTheme(AppThemeKind theme) =>
        ApplyAppearance(theme, _fontScaleStep, _pastelAccent);

    public static Color GetSaveStatusColor(SaveStatusKind kind) =>
        kind switch
        {
            SaveStatusKind.Modified => Warning,
            SaveStatusKind.Failed => Danger,
            SaveStatusKind.Saved or SaveStatusKind.AutoSaved => Success,
            SaveStatusKind.OfflineSaved => Warning,
            _ => TextMuted
        };

    public static void ApplyStandardDialog(Form form)
    {
        ApplyFormChrome(form);
        form.Load += (_, _) => FinalizeDialogLayout(form);
        form.Shown += (_, _) => FinalizeDialogLayout(form);
        SubscribeFormTheme(form, () => FinalizeDialogLayout(form));
        FinalizeDialogLayout(form);
    }

    private static void SubscribeFormTheme(Form form, Action refresh)
    {
        Action? handler = null;
        handler = () =>
        {
            if (form.IsDisposed)
            {
                if (handler != null)
                    Changed -= handler;
                return;
            }

            if (form.InvokeRequired)
                form.BeginInvoke(refresh);
            else
                refresh();
        };

        Changed += handler;
        form.FormClosed += OnFormClosed;

        void OnFormClosed(object? sender, FormClosedEventArgs e)
        {
            if (handler != null)
                Changed -= handler;
            form.FormClosed -= OnFormClosed;
        }
    }

    public static void FinalizeDialogLayout(Form form)
    {
        StyleControlTree(form.Controls);
        FitAllButtons(form.Controls);
        NormalizeDialogChoiceButtonSizes(form.Controls);
        NormalizeDialogActionButtonHeights(form.Controls);
        NormalizeFooterButtonHeights(form.Controls);
        AlignDialogButtonLayout(form);
    }

    private static void StyleControlTree(Control.ControlCollection controls)
    {
        foreach (Control control in controls)
        {
            switch (control)
            {
                case Button button when IsDialogChoiceButton(button):
                    StyleDialogChoiceButton(button);
                    break;
                case Button button when IsPrimaryButton(button):
                    StylePrimaryButton(button);
                    break;
                case Button button:
                    StyleDialogActionButton(button);
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
        label.ForeColor = IsMutedDialogLabel(label) ? TextMuted : TextPrimary;
        label.BackColor = Color.Transparent;

        if (label.AutoSize || IsFieldDialogLabel(label))
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

    private static bool IsMutedDialogLabel(Label label) =>
        string.Equals(label.Tag as string, "muted", StringComparison.Ordinal)
        || string.Equals(label.Name, "lblHint", StringComparison.Ordinal);

    private static bool IsFieldDialogLabel(Label label) =>
        string.Equals(label.Tag as string, "field-label", StringComparison.Ordinal);

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

    private static void NormalizeDialogChoiceButtonSizes(Control.ControlCollection controls)
    {
        NormalizeDialogChoiceButtonGroup(controls);

        foreach (Control control in controls)
        {
            if (control.HasChildren)
                NormalizeDialogChoiceButtonSizes(control.Controls);
        }
    }

    private static void NormalizeDialogChoiceButtonGroup(Control.ControlCollection controls)
    {
        var dialogButtons = controls.OfType<Button>()
            .Where(IsDialogChoiceButton)
            .ToList();

        if (dialogButtons.Count < 2)
            return;

        var width = dialogButtons.Max(button => button.Width);
        var height = dialogButtons.Max(button => button.Height);

        foreach (var button in dialogButtons)
        {
            button.AutoSize = false;
            button.Size = new Size(width, height);
            button.MinimumSize = new Size(width, height);
        }
    }

    private static void NormalizeDialogActionButtonHeights(Control.ControlCollection controls)
    {
        NormalizeDialogActionButtonGroup(controls);

        foreach (Control control in controls)
        {
            if (control.HasChildren)
                NormalizeDialogActionButtonHeights(control.Controls);
        }
    }

    private static void NormalizeDialogActionButtonGroup(Control.ControlCollection controls)
    {
        var actionButtons = CollectDialogActionButtons(controls);

        if (actionButtons.Count < 2)
            return;

        var height = actionButtons.Max(button => button.Height);
        foreach (var button in actionButtons)
        {
            button.AutoSize = false;
            button.Height = height;
            button.MinimumSize = new Size(button.MinimumSize.Width, height);
        }
    }

    private static List<Button> CollectDialogActionButtons(Control.ControlCollection controls)
    {
        var actionButtons = new List<Button>();
        foreach (Control control in controls)
        {
            if (control is Button button && IsDialogActionButton(button))
                actionButtons.Add(button);

            if (control.HasChildren)
                actionButtons.AddRange(CollectDialogActionButtons(control.Controls));
        }

        return actionButtons;
    }

    private static void NormalizeFooterButtonHeights(Control.ControlCollection controls)
    {
        foreach (Control control in controls)
        {
            if (control is Panel { Dock: DockStyle.Bottom } footer)
                NormalizeFooterButtonHeights(footer);

            if (control.HasChildren)
                NormalizeFooterButtonHeights(control.Controls);
        }
    }

    private static void NormalizeFooterButtonHeights(Panel footer)
    {
        var buttons = CollectFooterButtons(footer).ToList();
        if (buttons.Count < 2)
            return;

        var height = buttons.Max(button => button.Height);
        foreach (var button in buttons)
        {
            button.AutoSize = false;
            button.Height = height;
            button.MinimumSize = new Size(button.MinimumSize.Width, height);
        }
    }

    private static IEnumerable<Button> CollectFooterButtons(Control root)
    {
        foreach (Control control in root.Controls)
        {
            if (control is Button button)
                yield return button;

            if (control.HasChildren)
            {
                foreach (var nested in CollectFooterButtons(control))
                    yield return nested;
            }
        }
    }

    private static bool IsDialogActionButton(Button button) =>
        button.Name is "btnAdd"
            or "btnEdit"
            or "btnDelete"
            or "btnRemove"
            or "btnCopy"
            or "btnTest"
            or "btnBrowseSqlite"
            or "btnReloadTemplates"
            or "btnOpenTemplateFolder";

    private static void AlignDialogButtonLayout(Form form)
    {
        AlignFooterPanels(form.Controls);
        AlignAnchoredBottomButtons(form);
    }

    private static bool IsMixedFooterPanel(Panel panel) =>
        panel.Dock == DockStyle.Bottom &&
        panel.Controls.OfType<FlowLayoutPanel>().Any();

    private static void AlignFooterPanels(Control.ControlCollection controls)
    {
        foreach (Control control in controls)
        {
            if (control is Panel panel && (IsButtonFooterPanel(panel) || IsMixedFooterPanel(panel)))
                AlignFooterPanelButtons(panel);

            if (control.HasChildren)
                AlignFooterPanels(control.Controls);
        }
    }

    private static void AlignFooterPanelButtons(Panel footer)
    {
        if (footer.Controls.OfType<TableLayoutPanel>().Any())
            return;

        const int rightPadding = 12;
        const int gap = 8;

        var rightAnchored = footer.Controls.OfType<Button>()
            .Where(button => (button.Anchor & AnchorStyles.Right) != 0)
            .OrderBy(button => button.Left)
            .ToList();

        var flowPanel = FindFlowLayoutPanel(footer);
        if (flowPanel != null)
        {
            var buttons = CollectFooterButtons(footer).ToList();
            var buttonHeight = buttons.Count > 0 ? buttons.Max(button => button.Height) : 32;
            var top = footer.Padding.Top + Math.Max(0, (footer.ClientSize.Height - footer.Padding.Vertical - buttonHeight) / 2);

            flowPanel.Location = new Point(footer.Padding.Left, top);
            flowPanel.Height = buttonHeight;

            if (rightAnchored.Count > 0)
            {
                var rightX = footer.ClientSize.Width - footer.Padding.Right;
                for (var index = rightAnchored.Count - 1; index >= 0; index--)
                {
                    var button = rightAnchored[index];
                    rightX -= button.Width;
                    button.Location = new Point(rightX, top);
                    button.Height = buttonHeight;
                    rightX -= gap;
                }
            }

            return;
        }

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

    private static FlowLayoutPanel? FindFlowLayoutPanel(Control root)
    {
        if (root is FlowLayoutPanel flowPanel)
            return flowPanel;

        foreach (Control child in root.Controls)
        {
            var found = FindFlowLayoutPanel(child);
            if (found != null)
                return found;
        }

        return null;
    }

    private static bool IsDialogChoiceButton(Button button)
    {
        if (button.Name is "btnOk" or "btnCancel" or "btnSave" or "btnLogin" or "btnClose")
            return true;

        var form = button.FindForm();
        if (form != null &&
            (ReferenceEquals(form.AcceptButton, button) || ReferenceEquals(form.CancelButton, button)))
            return true;

        return button.DialogResult is DialogResult.OK or DialogResult.Cancel
            or DialogResult.Yes or DialogResult.No or DialogResult.Abort or DialogResult.Retry;
    }

    private static bool IsPrimaryButton(Button button) =>
        !IsDialogChoiceButton(button) && button.Name is "btnRestore";

    private static bool IsButtonFooterPanel(Panel panel) =>
        panel.Dock == DockStyle.Bottom &&
        panel.Controls.Count > 0 &&
        panel.Controls.Cast<Control>().All(static c => c is Button);

    private static void StylePanel(Panel panel)
    {
        if (string.Equals(panel.Tag as string, "swatch", StringComparison.Ordinal))
            return;

        panel.BackColor = Background;

        if (string.Equals(panel.Tag as string, "layout", StringComparison.Ordinal))
            return;

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

    public static void StyleToolTip(ToolTip toolTip)
    {
        toolTip.BackColor = Surface;
        toolTip.ForeColor = TextPrimary;
        toolTip.OwnerDraw = false;
    }

    public static void StyleToolStripToolTips(ToolStrip strip)
    {
        if (ToolStripToolTipField?.GetValue(strip) is ToolTip toolTip)
            StyleToolTip(toolTip);
    }

    private static readonly FieldInfo? ToolStripToolTipField =
        typeof(ToolStrip).GetField("toolTip", BindingFlags.Instance | BindingFlags.NonPublic);

    private static Color BlendColors(Color foreground, Color background, float amountForeground)
    {
        amountForeground = Math.Clamp(amountForeground, 0f, 1f);
        var amountBackground = 1f - amountForeground;
        return Color.FromArgb(
            255,
            (int)(foreground.R * amountForeground + background.R * amountBackground),
            (int)(foreground.G * amountForeground + background.G * amountBackground),
            (int)(foreground.B * amountForeground + background.B * amountBackground));
    }

    private const int TreeIndent = 24;
    private const int TreeGlyphSize = 16;
    private const int TreeGlyphHitSlop = 8;

    public static bool TryHandleTreeExpandClick(TreeView tree, Point clientPoint, out TreeNode? toggledNode)
    {
        toggledNode = null;
        if (!tree.ShowPlusMinus || tree is not ThemedTreeView themedTree)
            return false;

        var node = ResolveTreeExpandNode(themedTree, clientPoint);
        if (node == null || node.Nodes.Count == 0)
            return false;

        if (!themedTree.TryGetNodeRowBounds(node, out var rowBounds))
            return false;

        if (!IsTreeExpandClick(tree, node, clientPoint, rowBounds))
            return false;

        toggledNode = node;
        BeginExpandToggle(node);
        tree.Invalidate();
        return true;
    }

    private static void BeginExpandToggle(TreeNode node)
    {
        var tree = node.TreeView;
        if (tree == null)
            return;

        tree.BeginUpdate();
        try
        {
            if (node.IsExpanded)
                node.Collapse();
            else
                node.Expand();
        }
        finally
        {
            tree.EndUpdate();
        }
    }

    private static TreeNode? ResolveTreeExpandNode(ThemedTreeView tree, Point clientPoint)
    {
        var node = tree.GetNodeAtClientPoint(clientPoint);
        if (node?.Nodes.Count > 0)
            return node;

        var hit = tree.HitTest(clientPoint);
        if (hit.Node?.Nodes.Count > 0)
            return hit.Node;

        return null;
    }

    private static bool IsTreeExpandClick(TreeView tree, TreeNode node, Point clientPoint, Rectangle rowBounds)
    {
        if (clientPoint.Y < rowBounds.Top || clientPoint.Y >= rowBounds.Bottom)
            return false;

        var glyphBounds = GetTreeExpandGlyphBounds(tree, node, rowBounds);
        var hitBounds = glyphBounds;
        hitBounds.Inflate(TreeGlyphHitSlop, TreeGlyphHitSlop);
        if (hitBounds.Contains(clientPoint))
            return true;

        var hit = tree.HitTest(clientPoint);
        if (ReferenceEquals(hit.Node, node) &&
            (hit.Location & TreeViewHitTestLocations.PlusMinus) != 0)
            return true;

        var bandLeft = node.Level * tree.Indent;
        var bandRight = bandLeft + tree.Indent;
        return clientPoint.X >= bandLeft && clientPoint.X < bandRight;
    }

    private static int GetTreeGlyphLeft(TreeView tree, int level) =>
        level * tree.Indent + Math.Max(0, (tree.Indent - TreeGlyphSize) / 2);

    private static int GetTreeColumnCenter(TreeView tree, int level) =>
        level * tree.Indent + tree.Indent / 2;

    internal static Rectangle GetTreeExpandGlyphBounds(TreeView tree, TreeNode node, Rectangle rowBounds)
    {
        var left = GetTreeGlyphLeft(tree, node.Level);
        var top = rowBounds.Top + (rowBounds.Height - TreeGlyphSize) / 2;
        return new Rectangle(left, top, TreeGlyphSize, TreeGlyphSize);
    }

    private static int GetTreeNodeContentLeft(TreeView tree, TreeNode node)
    {
        var left = (node.Level + 1) * tree.Indent;
        if (!tree.ShowPlusMinus)
            left = node.Level * tree.Indent;

        return left;
    }

    public static void StyleTreeNodeDraw(object? sender, DrawTreeNodeEventArgs e)
    {
        if (sender is not TreeView tree || e.Node == null)
            return;

        var selected = (e.State & TreeNodeStates.Selected) != 0;
        var activeKey = tree is ThemedTreeView themedTree ? themedTree.ActiveNodeKey : null;
        var isActive = !selected
                       && activeKey != null
                       && e.Node.Tag is OutlineTarget outlineTarget
                       && string.Equals(outlineTarget.HeadingId, activeKey, StringComparison.Ordinal);

        Color bg;
        Color fg;
        if (selected)
        {
            bg = AccentHover;
            fg = Accent;
        }
        else if (isActive)
        {
            bg = BlendColors(AccentHover, tree.BackColor, 0.45f);
            fg = Accent;
        }
        else
        {
            bg = tree.BackColor;
            fg = tree.ForeColor;
        }

        e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.None;
        e.Graphics.CompositingQuality = System.Drawing.Drawing2D.CompositingQuality.HighSpeed;

        var rowBounds = new Rectangle(0, e.Bounds.Top, tree.ClientSize.Width, e.Bounds.Height);
        using (var brush = new SolidBrush(bg))
            e.Graphics.FillRectangle(brush, rowBounds);

        DrawTreeLines(e.Graphics, tree, e.Node, rowBounds);

        if (tree.ShowPlusMinus && e.Node.Nodes.Count > 0)
            DrawTreeExpandGlyph(e.Graphics, tree, e.Node, rowBounds, fg, bg);

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

        e.DrawDefault = false;
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

    private static int GetTreeNodeIconLeft(TreeView tree, TreeNode node) =>
        GetTreeNodeContentLeft(tree, node);

    private static void DrawTreeLines(Graphics graphics, TreeView tree, TreeNode node, Rectangle rowBounds)
    {
        if (!tree.ShowLines)
            return;

        var top = rowBounds.Top;
        var bottom = rowBounds.Bottom;
        var centerY = top + rowBounds.Height / 2;
        var hasExpandGlyph = tree.ShowPlusMinus && node.Nodes.Count > 0;
        Rectangle? glyphRect = hasExpandGlyph
            ? GetTreeExpandGlyphBounds(tree, node, rowBounds)
            : null;

        using var pen = new Pen(Border);

        for (var level = 0; level < node.Level - 1; level++)
        {
            if (HasSiblingBelowAtLevel(node, level))
            {
                var x = GetTreeColumnCenter(tree, level);
                DrawVerticalAvoidingGlyph(graphics, pen, x, top, bottom, glyphRect);
            }
        }

        if (node.Level == 0 && !tree.ShowRootLines)
            return;

        var connectorX = node.Level > 0
            ? GetTreeColumnCenter(tree, node.Level - 1)
            : GetTreeColumnCenter(tree, 0);
        var lineEndX = hasExpandGlyph
            ? GetTreeGlyphLeft(tree, node.Level)
            : GetTreeColumnCenter(tree, node.Level);

        graphics.DrawLine(pen, connectorX, centerY, lineEndX, centerY);

        if (node.Level == 0)
        {
            if (!IsLastSibling(node))
            {
                var verticalStart = glyphRect?.Bottom ?? centerY;
                DrawVerticalSegment(graphics, pen, connectorX, verticalStart, bottom);
            }

            return;
        }

        if (IsLastSibling(node))
            DrawVerticalAvoidingGlyph(graphics, pen, connectorX, top, centerY, glyphRect);
        else
            DrawVerticalAvoidingGlyph(graphics, pen, connectorX, top, bottom, glyphRect);
    }

    private static bool HorizontalIntersectsGlyph(int x, Rectangle glyph) =>
        x >= glyph.Left && x < glyph.Right;

    private static void DrawVerticalSegment(Graphics graphics, Pen pen, int x, int y1, int y2)
    {
        if (y2 > y1)
            graphics.DrawLine(pen, x, y1, x, y2);
    }

    private static void DrawVerticalAvoidingGlyph(Graphics graphics, Pen pen, int x, int y1, int y2, Rectangle? glyphRect)
    {
        if (!glyphRect.HasValue || !HorizontalIntersectsGlyph(x, glyphRect.Value))
        {
            DrawVerticalSegment(graphics, pen, x, y1, y2);
            return;
        }

        var glyph = glyphRect.Value;
        if (y1 < glyph.Top)
            DrawVerticalSegment(graphics, pen, x, y1, Math.Min(y2, glyph.Top));

        if (y2 > glyph.Bottom)
            DrawVerticalSegment(graphics, pen, x, Math.Max(y1, glyph.Bottom), y2);
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
            left += tree.ImageList.ImageSize.Width + 4;

        return left;
    }

    private static void DrawTreeExpandGlyph(Graphics graphics, TreeView tree, TreeNode node, Rectangle rowBounds, Color color, Color background)
    {
        var rect = GetTreeExpandGlyphBounds(tree, node, rowBounds);

        using (var brush = new SolidBrush(background))
            graphics.FillRectangle(brush, rect);

        using var pen = new Pen(color, 1.25f);
        graphics.DrawRectangle(pen, rect.X, rect.Y, rect.Width - 1, rect.Height - 1);

        var midY = rect.Top + rect.Height / 2;
        var midX = rect.Left + rect.Width / 2;
        graphics.DrawLine(pen, rect.Left + 3, midY, rect.Right - 4, midY);
        if (!node.IsExpanded)
            graphics.DrawLine(pen, midX, rect.Top + 3, midX, rect.Bottom - 4);
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
        StyleToolStripToolTips(strip);
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
        strip.ImageScalingSize = new Size(AppIcons.ToolbarIconSize, AppIcons.ToolbarIconSize);
        strip.Padding = new Padding(8, 6, 8, 6);
    }

    public static void ApplyVerticalToolbar(ToolStrip strip)
    {
        ApplyToolStrip(strip);
        strip.LayoutStyle = ToolStripLayoutStyle.VerticalStackWithOverflow;
        strip.Dock = DockStyle.Right;
        strip.AutoSize = false;
        strip.Width = VerticalToolbarWidth;
        strip.Padding = new Padding(4, 8, 4, 8);
        strip.BackColor = Sidebar;
        strip.GripStyle = ToolStripGripStyle.Hidden;
        strip.CanOverflow = false;
        strip.ImageScalingSize = new Size(VerticalToolbarIconSize, VerticalToolbarIconSize);
        strip.Renderer = EnsureSidebarToolbarRenderer();
        StyleVerticalToolbarItems(strip.Items);
    }

    public static void StyleVerticalToolbarItems(ToolStripItemCollection items)
    {
        foreach (ToolStripItem item in items)
        {
            if (item is ToolStripButton button)
            {
                button.AutoSize = false;
                button.DisplayStyle = ToolStripItemDisplayStyle.Image;
                button.ImageScaling = ToolStripItemImageScaling.None;
                button.Size = new Size(VerticalToolbarButtonSize, VerticalToolbarButtonSize);
                button.Margin = new Padding(0, 0, 0, 4);
                continue;
            }

            if (item is ToolStripSeparator separator)
                separator.Margin = new Padding(0, 4, 0, 4);
        }
    }

    public static void ApplyStatusStrip(StatusStrip strip)
    {
        ApplyToolStrip(strip);
        strip.Font = UiFontSmall;
        strip.Padding = new Padding(10, 5, 10, 5);
        strip.SizingGrip = false;
        strip.BackColor = Sidebar;
        strip.Renderer = EnsureSidebarToolbarRenderer();
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
        tree.ItemHeight = 28;
        tree.Indent = TreeIndent;
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
            AttachComboBoxBorder(comboBox);
            return;
        }

        comboBox.BackColor = Surface;
        comboBox.ForeColor = TextPrimary;
        comboBox.FlatStyle = FlatStyle.Flat;
        comboBox.DrawMode = DrawMode.OwnerDrawFixed;
        comboBox.Font = CloneUiFont();
        comboBox.ItemHeight = Math.Max(22, comboBox.Font.Height + 8);
        comboBox.DrawItem -= DrawComboBoxItem;
        comboBox.DrawItem += DrawComboBoxItem;

        AttachComboBoxBorder(comboBox);
    }

    internal static void AttachComboBoxBorder(ComboBox comboBox)
    {
        comboBox.Paint -= PaintComboBoxBorder;
        if (ShouldDrawComboBoxBorder(comboBox))
            comboBox.Paint += PaintComboBoxBorder;
    }

    private static bool ShouldDrawComboBoxBorder(ComboBox comboBox) =>
        !string.Equals(comboBox.Tag as string, "noborder", StringComparison.Ordinal);

    private static void PaintComboBoxBorder(object? sender, PaintEventArgs e)
    {
        if (sender is not ComboBox comboBox)
            return;

        var rect = comboBox.ClientRectangle;
        if (rect.Width <= 0 || rect.Height <= 0)
            return;

        rect.Width -= 1;
        rect.Height -= 1;
        using var pen = new Pen(Border);
        e.Graphics.DrawRectangle(pen, rect);
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
        ApplyDialogButtonIcon(button, primary: true);
        EnsureButtonHeight(button);
    }

    public static void StyleDialogChoiceButton(Button button)
    {
        StyleDialogActionButton(button);
        button.Font = UiFontSemibold;
    }

    public static void StyleDialogActionButton(Button button)
    {
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderSize = 1;
        button.FlatAppearance.BorderColor = Border;
        button.BackColor = Surface;
        button.ForeColor = TextPrimary;
        button.Font = UiFont;
        button.Cursor = Cursors.Hand;
        button.UseVisualStyleBackColor = false;
        button.UseCompatibleTextRendering = true;
        button.FlatAppearance.MouseOverBackColor = AccentHover;
        button.FlatAppearance.MouseDownBackColor = AccentPressed;
        ApplyDialogButtonIcon(button, primary: false);
        EnsureButtonHeight(button);
    }

    public static void StyleSidebarActionButton(Button button)
    {
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderSize = 1;
        button.FlatAppearance.BorderColor = Border;
        button.BackColor = Sidebar;
        button.ForeColor = TextPrimary;
        button.Font = UiFontSemibold;
        button.Cursor = Cursors.Hand;
        button.UseVisualStyleBackColor = false;
        button.UseCompatibleTextRendering = true;
        button.FlatAppearance.MouseOverBackColor = AccentHover;
        button.FlatAppearance.MouseDownBackColor = AccentPressed;
        ApplyDialogButtonIcon(button, primary: false);
        EnsureButtonHeight(button);
    }

    public static void StyleSecondaryButton(Button button) =>
        StyleDialogActionButton(button);

    private static void ApplyDialogButtonContentAlignment(Button button)
    {
        button.UseCompatibleTextRendering = true;

        if (button.Image != null)
        {
            button.TextImageRelation = TextImageRelation.ImageBeforeText;
            button.TextAlign = ContentAlignment.MiddleCenter;
            button.ImageAlign = ContentAlignment.MiddleCenter;
            button.Padding = new Padding(4, 0, 8, 0);
            return;
        }

        button.TextAlign = ContentAlignment.MiddleCenter;
        button.Padding = new Padding(12, 0, 12, 0);
    }

    private static void ApplyDialogButtonIcon(Button button, bool primary)
    {
        var iconName = ResolveDialogButtonIconName(button);
        if (iconName == null)
        {
            if (button.Image != null)
            {
                button.Image.Dispose();
                button.Image = null;
            }

            ApplyDialogButtonContentAlignment(button);
            return;
        }

        button.Image?.Dispose();
        button.Image = IconAssets.LoadDialogButtonIcon(16, iconName, primary);
        ApplyDialogButtonContentAlignment(button);
    }

    private static string? ResolveDialogButtonIconName(Button button)
    {
        if (!string.IsNullOrEmpty(button.Name))
        {
            var mapped = MapDialogButtonIconName(button.Name);
            if (mapped != null)
                return mapped;
        }

        var form = button.FindForm();
        if (ReferenceEquals(form?.CancelButton, button))
            return "exit";

        if (ReferenceEquals(form?.AcceptButton, button))
            return "save";

        return null;
    }

    private static string? MapDialogButtonIconName(string name) => name switch
    {
        "btnSave" or "btnOk" or "btnLogin" => "save",
        "btnCancel" => "exit",
        "btnClose" => "exit",
        "btnAdd" => "page_plus",
        "btnEdit" => "rename",
        "btnDelete" or "btnRemove" => "delete",
        "btnCopy" => "copy",
        "btnTest" => "refresh",
        "btnBrowseSqlite" => "database",
        "btnReloadTemplates" => "refresh",
        "btnOpenTemplateFolder" => "workspace",
        "btnRestore" => "history",
        _ => null
    };

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
        const int iconGap = 8;
        var iconWidth = button.Image?.Width ?? 0;
        var iconHeight = button.Image?.Height ?? 0;
        var iconExtra = iconWidth > 0 ? iconWidth + iconGap + 4 : 0;
        var contentWidth = textSize.Width + iconExtra;
        var contentHeight = Math.Max(textSize.Height, iconHeight);
        var horizontalPadding = button.Padding.Horizontal + (iconWidth > 0 ? 16 : 8);
        var verticalPadding = button.Padding.Vertical + 8;
        var width = Math.Max(minWidth, contentWidth + horizontalPadding);
        var fittedHeight = Math.Max(height, contentHeight + verticalPadding);

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

    public static void StyleNavRailButton(Button button)
    {
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderSize = 0;
        button.BackColor = Sidebar;
        button.ForeColor = TextPrimary;
        button.Cursor = Cursors.Hand;
        button.UseVisualStyleBackColor = false;
        button.FlatAppearance.MouseOverBackColor = AccentHover;
        button.FlatAppearance.MouseDownBackColor = AccentPressed;
        button.Padding = Padding.Empty;
        button.Margin = Padding.Empty;
    }

    public static void StyleHeaderPanel(Panel panel)
    {
        panel.BackColor = Surface;
        StyleBorderedPanel(panel, PanelEdges.Bottom);
    }

    public static Color GetPanelHeaderColor(PanelHeaderKind kind) =>
        kind switch
        {
            PanelHeaderKind.Workspace => PanelHeaderWorkspace,
            PanelHeaderKind.Outline => Surface,
            PanelHeaderKind.Editor => PanelHeaderEditor,
            PanelHeaderKind.PageTitle => PanelHeaderPageTitle,
            _ => Surface
        };

    public static void StylePanelTitleHeader(Panel header, Label titleLabel, PanelHeaderKind kind)
    {
        header.BackColor = GetPanelHeaderColor(kind);
        header.MinimumSize = new Size(0, 38);
        if (header.Height < 38)
            header.Height = 38;

        StyleBorderedPanel(header, PanelEdges.Bottom);

        titleLabel.BackColor = Color.Transparent;
        titleLabel.ForeColor = TextPrimary;
        titleLabel.Font = PanelTitleFont;
        titleLabel.TextAlign = ContentAlignment.MiddleLeft;
    }

    public static void StylePageTitlePanel(Panel panel, Label caption, TextBox textBox)
    {
        panel.BackColor = GetPanelHeaderColor(PanelHeaderKind.PageTitle);
        StyleBorderedPanel(panel, PanelEdges.Bottom);

        caption.BackColor = Color.Transparent;
        caption.ForeColor = TextPrimary;
        caption.Font = PageTitleCaptionFont;
        caption.TextAlign = ContentAlignment.MiddleLeft;

        StyleTextBox(textBox);
        textBox.Font = PageTitleTextFont;
    }

    private static float ScaleSize(float baseSize) =>
        Math.Max(7F, baseSize * _fontScaleFactor);

    private static void RefreshFonts()
    {
        ReplaceFont(ref _uiFont, "Segoe UI", BaseUiFontSize);
        ReplaceFont(ref _uiFontSmall, "Segoe UI", BaseUiFontSmallSize);
        ReplaceFont(ref _uiFontSemibold, "Segoe UI Semibold", BaseUiFontSemiboldSize);
        ReplaceFont(ref _headerFont, "Segoe UI Semibold", BaseHeaderFontSize);
        ReplaceFont(ref _panelTitleFont, "Segoe UI", BasePanelTitleFontSize, FontStyle.Bold);
        ReplaceFont(ref _pageTitleCaptionFont, "Segoe UI", BasePageTitleCaptionFontSize, FontStyle.Bold);
        ReplaceFont(ref _pageTitleTextFont, "Segoe UI", BasePageTitleTextFontSize);
        ReplaceFont(ref _titleFont, "Segoe UI Semibold", BaseTitleFontSize);
    }

    private static void ReplaceFont(ref Font field, string family, float baseSize, FontStyle style = FontStyle.Regular)
    {
        field = new Font(family, ScaleSize(baseSize), style);
    }

    public static void StyleBorderedPanel(Panel panel, PanelEdges edges)
    {
        panel.Paint -= DrawPanelBorder;
        panel.Resize -= InvalidateBorderedPanel;
        PanelBorderEdges.Remove(panel);

        if (edges == PanelEdges.None)
            return;

        PanelBorderEdges.Add(panel, new PanelBorderState(edges));
        panel.Paint += DrawPanelBorder;
        panel.Resize += InvalidateBorderedPanel;
        panel.Invalidate();
    }

    private static void InvalidateBorderedPanel(object? sender, EventArgs e)
    {
        if (sender is Control control && !control.IsDisposed)
            control.Invalidate(false);
    }

    private sealed class PanelBorderState(PanelEdges edges)
    {
        public PanelEdges Edges { get; } = edges;
    }

    public static void StyleSplitContainer(SplitContainer split)
    {
        split.BorderStyle = BorderStyle.None;
        split.SplitterWidth = SplitterBorderWidth;
        split.Panel1.BackColor = Sidebar;
        split.Panel2.BackColor = EditorBackground;
        split.BackColor = split.Panel1.BackColor;
    }

    public static void StyleTabControl(TabControl tabControl)
    {
        tabControl.Font = UiFont;
        tabControl.Padding = new Point(0, 4);
        tabControl.BackColor = EditorBackground;

        foreach (TabPage page in tabControl.TabPages)
            page.BackColor = EditorBackground;
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
        Panel workspaceHeader,
        Label workspaceHeaderLabel,
        TreeView outlineTree,
        Panel outlineSidebar,
        Panel editorHeader,
        Label editorHeaderLabel,
        Panel markdownHost,
        Panel titlePanel,
        Label titleCaption,
        TextBox titleBox,
        Panel workspaceHost,
        Panel editorHost,
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

        StylePanelTitleHeader(workspaceHeader, workspaceHeaderLabel, PanelHeaderKind.Workspace);

        outlineSidebar.BackColor = Sidebar;
        outlineSidebar.Padding = new Padding(8, 9, 0, 1);
        StyleBorderedPanel(outlineSidebar, PanelEdges.Right);

        markdownHost.BackColor = Surface;
        markdownHost.Padding = new Padding(1);
        StyleBorderedPanel(markdownHost, PanelEdges.All);
        StylePanelTitleHeader(editorHeader, editorHeaderLabel, PanelHeaderKind.Editor);

        StylePageTitlePanel(titlePanel, titleCaption, titleBox);

        rightPanel.BackColor = Surface;
        rightPanel.Padding = Padding.Empty;
        StyleBorderedPanel(rightPanel, PanelEdges.Top | PanelEdges.Right | PanelEdges.Bottom);

        editorHost.BackColor = Sidebar;
        editorHost.Padding = new Padding(4, 8, 12, 8);

        StyleSplitContainer(outerSplit);
        workspaceHost.BackColor = Sidebar;
        workspaceHost.Padding = new Padding(12, 8, 4, 8);
        StyleBorderedPanel(workspaceHost, PanelEdges.All);
        outerSplit.Panel1.Padding = Padding.Empty;

        StyleSplitContainer(editorSplit);
        webViewEditor.DefaultBackgroundColor = EditorBackground;

        statusLabel.ForeColor = TextSecondary;
        saveStatusLabel.ForeColor = TextMuted;
    }

    private static void EnsureRenderer()
    {
        _colorTable ??= new ModernColorTable(Surface);
        _renderer ??= new ModernToolStripRenderer(_colorTable);
    }

    private static ToolStripProfessionalRenderer EnsureSidebarToolbarRenderer()
    {
        _sidebarToolbarColorTable ??= new ModernColorTable(Sidebar);
        _sidebarToolbarRenderer ??= new ModernToolStripRenderer(_sidebarToolbarColorTable, sidebarStyle: true);
        return _sidebarToolbarRenderer;
    }

    private sealed class ModernToolStripRenderer : ToolStripProfessionalRenderer
    {
        private readonly bool _sidebarStyle;

        public ModernToolStripRenderer(ProfessionalColorTable colorTable, bool sidebarStyle = false)
            : base(colorTable)
        {
            _sidebarStyle = sidebarStyle;
        }

        protected override void OnRenderToolStripBackground(ToolStripRenderEventArgs e)
        {
            if (_sidebarStyle)
            {
                using var brush = new SolidBrush(Sidebar);
                e.Graphics.FillRectangle(brush, e.AffectedBounds);
                return;
            }

            base.OnRenderToolStripBackground(e);
        }

        protected override void OnRenderButtonBackground(ToolStripItemRenderEventArgs e)
        {
            if (_sidebarStyle && e.Item is ToolStripButton)
            {
                var bounds = new Rectangle(Point.Empty, e.Item.Size);
                bounds.Inflate(-1, -1);

                if (e.Item.Pressed)
                {
                    using var brush = new SolidBrush(AccentPressed);
                    e.Graphics.FillRectangle(brush, bounds);
                }
                else if (e.Item.Selected)
                {
                    using var brush = new SolidBrush(AccentHover);
                    e.Graphics.FillRectangle(brush, bounds);
                }

                return;
            }

            base.OnRenderButtonBackground(e);
        }

        protected override void OnRenderGrip(ToolStripGripRenderEventArgs e)
        {
            if (_sidebarStyle)
                return;

            base.OnRenderGrip(e);
        }

        protected override void OnRenderOverflowButtonBackground(ToolStripItemRenderEventArgs e)
        {
            if (_sidebarStyle)
                return;

            base.OnRenderOverflowButtonBackground(e);
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
            if (e.ToolStrip is StatusStrip)
                return;

            if (e.ToolStrip is MenuStrip or ContextMenuStrip or ToolStripDropDown)
            {
                using var pen = new Pen(Border);
                var bounds = new Rectangle(Point.Empty, e.ToolStrip.Size);
                bounds.Width -= 1;
                bounds.Height -= 1;
                e.Graphics.DrawRectangle(pen, bounds);
                return;
            }

            if (e.ToolStrip.LayoutStyle == ToolStripLayoutStyle.VerticalStackWithOverflow
                && e.ToolStrip.Dock == DockStyle.Right)
                return;

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

        using (var background = new SolidBrush(control.BackColor))
            e.Graphics.FillRectangle(background, 0, 0, width, height);

        using var pen = CreatePanelDividerPen();
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
        private readonly Color _chromeBackground;

        public ModernColorTable(Color chromeBackground) =>
            _chromeBackground = chromeBackground;

        public override Color ToolStripGradientBegin => _chromeBackground;
        public override Color ToolStripGradientMiddle => _chromeBackground;
        public override Color ToolStripGradientEnd => _chromeBackground;
        public override Color MenuBorder => Border;
        public override Color MenuItemBorder => AccentHover;
        public override Color MenuItemSelected => AccentHover;
        public override Color MenuItemSelectedGradientBegin => AccentHover;
        public override Color MenuItemSelectedGradientEnd => AccentHover;
        public override Color MenuItemPressedGradientBegin => AccentPressed;
        public override Color MenuItemPressedGradientMiddle => AccentPressed;
        public override Color MenuItemPressedGradientEnd => AccentPressed;
        public override Color MenuStripGradientBegin => _chromeBackground;
        public override Color MenuStripGradientEnd => _chromeBackground;
        public override Color ImageMarginGradientBegin => _chromeBackground;
        public override Color ImageMarginGradientMiddle => _chromeBackground;
        public override Color ImageMarginGradientEnd => _chromeBackground;
        public override Color SeparatorDark => Border;
        public override Color SeparatorLight => BorderLight;
        public override Color StatusStripGradientBegin => _chromeBackground;
        public override Color StatusStripGradientEnd => _chromeBackground;
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
        public override Color OverflowButtonGradientBegin => _chromeBackground;
        public override Color OverflowButtonGradientMiddle => _chromeBackground;
        public override Color OverflowButtonGradientEnd => _chromeBackground;
    }
}
