using System.Drawing.Drawing2D;

namespace ImageViewerV30;

/// <summary>앱 전역 밝은 UI 테마.</summary>
public static class UiTheme
{
    // ── Palette (light neutrals) ──────────────────────────────────────────
    public static readonly Color BgApp = Color.FromArgb(245, 246, 248);
    public static readonly Color BgSurface = Color.FromArgb(255, 255, 255);
    public static readonly Color BgElevated = Color.FromArgb(248, 249, 252);
    public static readonly Color BgPreview = Color.FromArgb(236, 238, 242);
    public static readonly Color BgToolbar = Color.FromArgb(250, 251, 253);
    public static readonly Color BgInput = Color.FromArgb(255, 255, 255);

    public static readonly Color Accent = Color.FromArgb(72, 87, 115);
    public static readonly Color AccentHover = Color.FromArgb(88, 103, 131);
    public static readonly Color AccentPressed = Color.FromArgb(58, 73, 101);
    public static readonly Color TextOnAccent = Color.White;

    public static readonly Color TextPrimary = Color.FromArgb(32, 34, 40);
    public static readonly Color TextSecondary = Color.FromArgb(96, 100, 108);
    public static readonly Color TextMuted = Color.FromArgb(140, 144, 152);

    public static readonly Color Border = Color.FromArgb(200, 204, 212);
    public static readonly Color BorderSubtle = Color.FromArgb(218, 222, 228);
    public static readonly Color Separator = Color.FromArgb(210, 214, 220);

    public static readonly Color BtnSecondary = Color.FromArgb(232, 234, 238);
    public static readonly Color BtnSecondaryHover = Color.FromArgb(218, 222, 228);
    public static readonly Color BtnGhost = Color.FromArgb(248, 249, 252);
    public static readonly Color BtnGhostHover = Color.FromArgb(235, 238, 244);

    public static readonly Color ProgressTrack = Color.FromArgb(228, 230, 236);
    public static readonly Color ProgressFill = Color.FromArgb(120, 132, 156);
    public static readonly Color SeekPlayed = Color.FromArgb(120, 132, 156);
    public static readonly Color SeekTrack = Color.FromArgb(218, 222, 228);

    public static readonly Font FontUi = new("Segoe UI", 9f);
    public static readonly Font FontUiSemibold = new("Segoe UI", 9f, FontStyle.Bold);
    public static readonly Font FontHeading = new("Segoe UI", 9f, FontStyle.Bold);
    public static readonly Font FontIcon = new("Segoe MDL2 Assets", 10f);
    public static readonly Font FontIconLarge = new("Segoe MDL2 Assets", 12f);

    public enum ButtonVariant { Primary, Secondary, Ghost, Icon }

    public static void ApplyToForm(Form form)
    {
        form.BackColor = BgApp;
        form.ForeColor = TextPrimary;
        form.Font = FontUi;
    }

    public static void StyleButtonsInTree(Control root, IReadOnlyDictionary<string, ButtonVariant>? nameOverrides = null)
    {
        foreach (Control c in GetAllControls(root))
        {
            if (c is not Button btn) continue;
            var variant = ButtonVariant.Ghost;
            if (nameOverrides is not null && nameOverrides.TryGetValue(btn.Name, out var v))
                variant = v;
            else if (btn.Parent?.Name is "tblInstantFx" or "tblParamFx")
                variant = ButtonVariant.Ghost;
            else if (btn.Name.StartsWith("btnApply", StringComparison.Ordinal) ||
                     btn.Name.Contains("RemoveBg", StringComparison.Ordinal) ||
                     btn.Name is "btnAiRemoveBg" or "btnColorRemoveBg")
                variant = ButtonVariant.Primary;
            else if (btn.Name.Contains("Zoom", StringComparison.Ordinal))
                variant = ButtonVariant.Ghost;
            else if (btn.Name.StartsWith("btn", StringComparison.Ordinal))
                variant = ButtonVariant.Secondary;
            StyleButton(btn, variant);
        }
    }

    public static void StyleInputsInTree(Control root)
    {
        foreach (Control c in GetAllControls(root))
        {
            switch (c)
            {
                case TrackBar trk: StyleTrackBar(trk); break;
                case ComboBox cb: StyleComboBox(cb); break;
                case NumericUpDown num:
                    num.BackColor = BgInput;
                    num.ForeColor = TextPrimary;
                    num.Font = FontUi;
                    break;
                case RadioButton rb:
                    rb.ForeColor = TextSecondary;
                    rb.BackColor = Color.Transparent;
                    break;
                case CheckBox chk:
                    chk.ForeColor = TextSecondary;
                    chk.BackColor = Color.Transparent;
                    break;
            }
        }
    }

    public static void StyleButton(Button btn, ButtonVariant variant = ButtonVariant.Secondary)
    {
        btn.FlatStyle = FlatStyle.Flat;
        btn.UseVisualStyleBackColor = false;
        btn.Font = variant == ButtonVariant.Icon ? FontIconLarge : FontUi;
        btn.Cursor = Cursors.Hand;
        btn.FlatAppearance.BorderSize = variant == ButtonVariant.Ghost ? 1 : 0;
        if (variant == ButtonVariant.Ghost)
            btn.FlatAppearance.BorderColor = BorderSubtle;

        ApplyButtonColors(btn, variant, hovered: false);

        btn.MouseEnter -= Button_MouseEnter;
        btn.MouseLeave -= Button_MouseLeave;
        btn.MouseDown -= Button_MouseDown;
        btn.MouseUp -= Button_MouseUp;
        btn.MouseEnter += Button_MouseEnter;
        btn.MouseLeave += Button_MouseLeave;
        btn.MouseDown += Button_MouseDown;
        btn.MouseUp += Button_MouseUp;
        btn.Tag = variant;
    }

    private static void ApplyButtonColors(Button btn, ButtonVariant variant, bool hovered, bool pressed = false)
    {
        (Color back, Color fore) = variant switch
        {
            ButtonVariant.Primary => pressed ? (AccentPressed, TextOnAccent)
                : hovered ? (AccentHover, TextOnAccent)
                : (Accent, TextOnAccent),
            ButtonVariant.Secondary => pressed ? (BtnSecondary, TextPrimary)
                : hovered ? (BtnSecondaryHover, TextPrimary)
                : (BtnSecondary, TextPrimary),
            ButtonVariant.Ghost => pressed ? (BtnGhostHover, TextPrimary)
                : hovered ? (BtnGhostHover, TextPrimary)
                : (BtnGhost, TextPrimary),
            ButtonVariant.Icon => pressed ? (AccentPressed, TextOnAccent)
                : hovered ? (BtnSecondaryHover, TextPrimary)
                : (BtnSecondary, TextPrimary),
            _ => (BtnSecondary, TextPrimary)
        };
        btn.BackColor = back;
        btn.ForeColor = fore;
    }

    private static void Button_MouseEnter(object? sender, EventArgs e)
    {
        if (sender is Button b && b.Tag is ButtonVariant v)
            ApplyButtonColors(b, v, hovered: true);
    }

    private static void Button_MouseLeave(object? sender, EventArgs e)
    {
        if (sender is Button b && b.Tag is ButtonVariant v)
            ApplyButtonColors(b, v, hovered: false);
    }

    private static void Button_MouseDown(object? sender, MouseEventArgs e)
    {
        if (sender is Button b && b.Tag is ButtonVariant v)
            ApplyButtonColors(b, v, hovered: true, pressed: true);
    }

    private static void Button_MouseUp(object? sender, MouseEventArgs e)
    {
        if (sender is Button b && b.Tag is ButtonVariant v)
            ApplyButtonColors(b, v, hovered: b.ClientRectangle.Contains(b.PointToClient(Cursor.Position)));
    }

    public static void StyleTextBox(TextBox textBox)
    {
        textBox.BorderStyle = BorderStyle.FixedSingle;
        textBox.BackColor = BgInput;
        textBox.ForeColor = TextPrimary;
        textBox.Font = FontUi;
    }

    public static void StyleTreeView(TreeView tree)
    {
        tree.BackColor = BgSurface;
        tree.ForeColor = TextPrimary;
        tree.BorderStyle = BorderStyle.None;
        tree.Font = FontUi;
        tree.LineColor = Border;
        tree.HideSelection = false;
    }

    public static void StyleListView(ListView list)
    {
        list.BackColor = BgSurface;
        list.ForeColor = TextPrimary;
        list.BorderStyle = BorderStyle.None;
        list.Font = FontUi;
        list.GridLines = false;
    }

    public static void StyleLabel(Label label, bool secondary = false)
    {
        label.BackColor = Color.Transparent;
        label.ForeColor = secondary ? TextSecondary : TextPrimary;
        label.Font = FontUi;
    }

    public static void StyleSectionLabel(Label label)
    {
        label.BackColor = Color.Transparent;
        label.ForeColor = TextMuted;
        label.Font = FontHeading;
    }

    public static void StyleComboBox(ComboBox cb)
    {
        cb.FlatStyle = FlatStyle.Flat;
        cb.BackColor = BgInput;
        cb.ForeColor = TextPrimary;
        cb.Font = FontUi;
    }

    public static void StyleTrackBar(TrackBar trk)
    {
        trk.BackColor = BgSurface;
        trk.ForeColor = TextSecondary;
    }

    public static void StyleProgressBar(ProgressBar bar)
    {
        bar.ForeColor = ProgressFill;
        bar.BackColor = ProgressTrack;
        bar.Style = ProgressBarStyle.Continuous;
    }

    public static void StyleSplitContainer(SplitContainer split)
    {
        split.BackColor = BorderSubtle;
        split.Panel1.BackColor = BgSurface;
        split.Panel2.BackColor = BgApp;
        split.SplitterWidth = 4;
    }

    public static void StyleToolStrip(ToolStrip strip)
    {
        strip.BackColor = BgToolbar;
        strip.ForeColor = TextPrimary;
        strip.Renderer = new ModernToolStripRenderer();
        strip.Padding = new Padding(4, 2, 4, 2);
        foreach (ToolStripItem item in strip.Items)
        {
            if (item is ToolStripButton btn)
            {
                btn.ForeColor = TextPrimary;
                btn.Font = FontUi;
            }
        }
    }

    public static void StyleStatusStrip(StatusStrip strip)
    {
        strip.BackColor = BgToolbar;
        strip.ForeColor = TextSecondary;
        strip.Renderer = new ModernToolStripRenderer();
        strip.Font = FontUi;
        strip.Padding = new Padding(6, 0, 6, 0);
        foreach (ToolStripItem item in strip.Items)
        {
            item.ForeColor = TextSecondary;
            item.BackColor = Color.Transparent;
        }
    }

    public static void StyleTabControl(TabControl tabs)
    {
        tabs.DrawMode = TabDrawMode.OwnerDrawFixed;
        tabs.SizeMode = TabSizeMode.Fixed;
        tabs.ItemSize = new Size(96, 28);
        tabs.Padding = new Point(10, 4);
        tabs.BackColor = BgSurface;
        tabs.ForeColor = TextPrimary;
        tabs.Font = FontUi;
        tabs.DrawItem -= TabControl_DrawItem;
        tabs.DrawItem += TabControl_DrawItem;
    }

    private static void TabControl_DrawItem(object? sender, DrawItemEventArgs e)
    {
        if (sender is not TabControl tabs || e.Index < 0 || e.Index >= tabs.TabPages.Count)
            return;

        var page = tabs.TabPages[e.Index];
        bool selected = tabs.SelectedIndex == e.Index;
        var bounds = e.Bounds;

        using var bgBrush = new SolidBrush(selected ? BgElevated : BgSurface);
        using var textBrush = new SolidBrush(selected ? TextPrimary : TextSecondary);

        e.Graphics.FillRectangle(bgBrush, bounds);
        if (selected)
        {
            using var pen = new Pen(Accent, 2f);
            e.Graphics.DrawLine(pen, bounds.Left + 8, bounds.Bottom - 1, bounds.Right - 8, bounds.Bottom - 1);
        }

        var flags = TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter;
        TextRenderer.DrawText(e.Graphics, page.Text, tabs.Font, bounds, textBrush.Color, flags);
    }

    public static void ApplyThumbnailCard(Panel card, Label title, PictureBox thumb)
    {
        card.BackColor = BgElevated;
        title.ForeColor = TextSecondary;
        title.Font = FontUi;
        thumb.BackColor = BgPreview;
    }

    public static Button CreateFxButton(string text, int? paramIndex = null)
    {
        var btn = new Button
        {
            Text = text,
            Size = new Size(122, 30),
            Margin = new Padding(2),
            UseVisualStyleBackColor = false,
            FlatStyle = FlatStyle.Flat,
            FlatAppearance = { BorderSize = 1, BorderColor = BorderSubtle },
            BackColor = BtnGhost,
            ForeColor = TextPrimary,
            Cursor = Cursors.Hand
        };
        if (paramIndex.HasValue)
            btn.Tag = paramIndex.Value;
        return btn;
    }

    private static IEnumerable<Control> GetAllControls(Control root)
    {
        foreach (Control c in root.Controls)
        {
            yield return c;
            foreach (Control child in GetAllControls(c))
                yield return child;
        }
    }

    private sealed class ModernToolStripRenderer : ToolStripProfessionalRenderer
    {
        public ModernToolStripRenderer() : base(new ModernColorTable()) { }

        protected override void OnRenderToolStripBackground(ToolStripRenderEventArgs e) =>
            e.Graphics.Clear(BgToolbar);

        protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e) { }

        protected override void OnRenderButtonBackground(ToolStripItemRenderEventArgs e)
        {
            bool hover = e.Item.Selected || e.Item.Pressed;
            if (!hover || e.Item is not ToolStripButton) return;
            var rect = new Rectangle(Point.Empty, e.Item.Size);
            using var brush = new SolidBrush(BtnSecondaryHover);
            e.Graphics.FillRectangle(brush, rect);
        }

        protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
        {
            e.TextColor = e.Item.Enabled ? TextPrimary : TextMuted;
            base.OnRenderItemText(e);
        }

        protected override void OnRenderSeparator(ToolStripSeparatorRenderEventArgs e)
        {
            int x = e.Item.Width / 2;
            using var pen = new Pen(Separator);
            e.Graphics.DrawLine(pen, x, 4, x, e.Item.Height - 4);
        }
    }

    private sealed class ModernColorTable : ProfessionalColorTable
    {
        public override Color ToolStripGradientBegin => BgToolbar;
        public override Color ToolStripGradientMiddle => BgToolbar;
        public override Color ToolStripGradientEnd => BgToolbar;
        public override Color MenuBorder => Border;
        public override Color SeparatorDark => Separator;
        public override Color SeparatorLight => Separator;
    }
}
